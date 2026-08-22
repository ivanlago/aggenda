"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { clientMemberships, clients, organizationServicePlans, outboxEvents, paymentChargeEvents, paymentCharges, servicePackages, vouchers, whatsappChannels } from "@/db/schema";
import { organizationAsaasRequest } from "@/lib/asaas";
import { writeAuditLog } from "@/lib/audit";
import { triggerOutboxWorker } from "@/lib/outbox-trigger";
import { getOrganizationAsaasCredential } from "@/lib/organization-asaas";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const digits = (value: string) => value.replace(/\D/g, "");
const cents = (value: string) => Math.round(Number(value.replace(/\./g, "").replace(",", ".")) * 100);

export async function createVoucher(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "services.manage");
  const code = text(data, "code").toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  const discountType = text(data, "discountType") === "percentage" ? "percentage" : "fixed";
  const discountValue = discountType === "percentage" ? Number(text(data, "discountValue")) : cents(text(data, "discountValue"));
  const maxUses = Number(text(data, "maxUses")) || null;
  const validUntil = text(data, "validUntil") ? new Date(`${text(data, "validUntil")}T23:59:59`) : null;
  if (code.length < 3 || discountValue <= 0 || (discountType === "percentage" && discountValue > 100)) throw new Error("Informe código e benefício válidos.");
  const [created] = await db.insert(vouchers).values({ organizationId: organization.id, code, description: text(data, "description") || null, discountType, discountValue, maxUses, validUntil }).returning({ id: vouchers.id });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "create", entityType: "voucher", entityId: created.id });
  revalidatePath("/crescimento");
}

export async function createMembership(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.manage");
  const clientId = text(data, "clientId"); const packageId = text(data, "packageId"); const document = digits(text(data, "document"));
  const monthlyPriceInCents = cents(text(data, "monthlyPrice")); const billingDay = Math.min(28, Math.max(1, Number(text(data, "billingDay")) || 1));
  const [[client], [bundle]] = await Promise.all([
    db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, organization.id))).limit(1),
    db.select().from(servicePackages).where(and(eq(servicePackages.id, packageId), eq(servicePackages.organizationId, organization.id))).limit(1),
  ]);
  if (!client || !bundle || ![11, 14].includes(document.length) || monthlyPriceInCents < 100) throw new Error("Informe cliente, pacote, documento e mensalidade válidos.");
  const credential = await getOrganizationAsaasCredential(organization.id);
  type CustomerList = { data?: Array<{ id: string }> }; type Customer = { id: string }; type Subscription = { id: string };
  const found = await organizationAsaasRequest<CustomerList>(`/customers?cpfCnpj=${document}&limit=1`, credential);
  const customerId = found.data?.[0]?.id ?? (await organizationAsaasRequest<Customer>("/customers", credential, { method: "POST", body: { name: client.name, cpfCnpj: document, email: client.email ?? undefined, phone: client.phone ?? undefined } })).id;
  const chargeId = crypto.randomUUID();
  const nextDueDate = new Date(); nextDueDate.setDate(billingDay); if (nextDueDate <= new Date()) nextDueDate.setMonth(nextDueDate.getMonth() + 1);
  const subscription = await organizationAsaasRequest<Subscription>("/subscriptions", credential, { method: "POST", body: { customer: customerId, billingType: "UNDEFINED", value: monthlyPriceInCents / 100, nextDueDate: nextDueDate.toISOString().slice(0, 10), cycle: "MONTHLY", description: `Assinatura ${bundle.name}`, externalReference: `charge:${chargeId}` } });
  const [membership] = await db.insert(clientMemberships).values({ organizationId: organization.id, clientId, packageId, monthlyPriceInCents, billingDay, providerSubscriptionId: subscription.id, nextRenewalAt: nextDueDate }).returning({ id: clientMemberships.id });
  await db.insert(paymentCharges).values({ id: chargeId, organizationId: organization.id, providerSubscriptionId: subscription.id, providerCustomerId: customerId, originType: "membership", originId: membership.id, clientId, paymentMethod: "link", chargeMode: "recurring", status: "pending", amountInCents: monthlyPriceInCents, description: `Assinatura ${bundle.name}`, customerName: client.name, customerDocument: document, customerEmail: client.email, customerPhone: client.phone, dueDate: nextDueDate.toISOString().slice(0, 10), createdByUserId: session.user.id, metadata: { membershipId: membership.id } });
  await db.insert(paymentChargeEvents).values({ organizationId: organization.id, chargeId, eventType: "subscription_created", status: "pending", payload: { membershipId: membership.id, providerSubscriptionId: subscription.id } });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "create", entityType: "client_membership", entityId: membership.id });
  revalidatePath("/crescimento");
}

export async function sendRecoveryMessage(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "clients.manage");
  const clientId = text(data, "clientId");
  const [[client], [channel], [plan]] = await Promise.all([
    db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, organization.id))).limit(1),
    db.select().from(whatsappChannels).where(and(eq(whatsappChannels.organizationId, organization.id), eq(whatsappChannels.isActive, true))).limit(1),
    db.select().from(organizationServicePlans).where(eq(organizationServicePlans.organizationId, organization.id)).limit(1),
  ]);
  const phone = digits(client?.phone ?? "");
  if (!client || !channel || !phone || plan?.whatsappServiceCode === "assisted") throw new Error("Este contato requer um canal WhatsApp Cloud API ativo.");
  const to = phone.startsWith("55") ? phone : `55${phone}`;
  await db.insert(outboxEvents).values({ organizationId: organization.id, eventKey: `whatsapp:recovery:${client.id}:${new Date().toISOString().slice(0, 10)}`, eventType: "whatsapp.template.send", aggregateType: "client", aggregateId: client.id, payload: { organizationId: organization.id, channelId: channel.id, phoneNumberId: channel.phoneNumberId, to, notificationKind: "recovery", clientId: client.id, languageCode: "pt_BR", parameters: [client.name, organization.name, `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/agendar/${organization.slug}`], preview: `Olá, ${client.name}! Sentimos sua falta na ${organization.name}. Quer reservar um novo horário?` } }).onConflictDoNothing({ target: outboxEvents.eventKey });
  await triggerOutboxWorker();
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "queue", entityType: "whatsapp_recovery", entityId: client.id });
  revalidatePath("/crescimento");
}
