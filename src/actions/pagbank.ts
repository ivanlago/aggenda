"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { clients, financialEntries, organizationFinancialIntegrations, paymentChargeEvents, paymentCharges } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { encryptFinancialCredential } from "@/lib/financial-secret";
import { getPagBankCredential, pagBankRequest } from "@/lib/pagbank";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const digits = (value: string) => value.replace(/\D/g, "");
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
const refresh = () => { revalidatePath("/financeiro/cobrancas"); revalidatePath("/financeiro"); };
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message.slice(0, 500) : fallback;

type PublicKey = { public_key?: string };
type PagBankOrder = {
  id: string;
  reference_id?: string;
  qr_codes?: Array<{ id?: string; text?: string; links?: Array<{ rel?: string; href?: string; media?: string }> }>;
  links?: Array<{ rel?: string; href?: string }>;
};

export async function connectPagBankAccount(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "integrations.manage");
  const token = text(data, "token");
  const environment = text(data, "environment") === "production" ? "production" : "sandbox";
  if (token.length < 30) return { error: "Informe um token PagBank válido." };
  try { await pagBankRequest<PublicKey>("/public-keys/card", { token, environment }); }
  catch (error) { return { error: message(error, "Não foi possível validar o token PagBank.") }; }
  const webhookStatus = appUrl().startsWith("https://") ? "configured" : "pending_https";
  const metadata = { accountName: "Conta PagBank", billingOwner: "client", webhookStatus, testedAt: new Date().toISOString(), capabilities: ["pix"] };
  await db.insert(organizationFinancialIntegrations).values({ organizationId: organization.id, provider: "pagbank", environment, encryptedCredential: encryptFinancialCredential(JSON.stringify({ token })), status: "active", metadata }).onConflictDoUpdate({ target: [organizationFinancialIntegrations.organizationId, organizationFinancialIntegrations.provider], set: { environment, encryptedCredential: encryptFinancialCredential(JSON.stringify({ token })), status: "active", metadata, updatedAt: new Date() } });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "connect_and_test", entityType: "financial_integration:pagbank", details: { environment, webhookStatus } });
  refresh();
}

export async function testPagBankIntegration() {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "integrations.manage");
  try {
    const credential = await getPagBankCredential(organization.id);
    await pagBankRequest<PublicKey>("/public-keys/card", credential);
    const [integration] = await db.select().from(organizationFinancialIntegrations).where(and(eq(organizationFinancialIntegrations.organizationId, organization.id), eq(organizationFinancialIntegrations.provider, "pagbank"))).limit(1);
    await db.update(organizationFinancialIntegrations).set({ metadata: { ...(integration.metadata ?? {}), testedAt: new Date().toISOString(), lastTestStatus: "success" }, updatedAt: new Date() }).where(eq(organizationFinancialIntegrations.id, integration.id));
    await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "test", entityType: "financial_integration:pagbank" });
    refresh();
  } catch (error) { return { error: message(error, "Falha ao testar PagBank.") }; }
}

export async function disconnectPagBankAccount() {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "integrations.manage");
  await db.update(organizationFinancialIntegrations).set({ status: "disconnected", updatedAt: new Date() }).where(and(eq(organizationFinancialIntegrations.organizationId, organization.id), eq(organizationFinancialIntegrations.provider, "pagbank")));
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "disconnect", entityType: "financial_integration:pagbank" });
  refresh();
}

export async function createPagBankCharge(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.manage");
  const financialEntryId = text(data, "financialEntryId");
  const customerName = text(data, "customerName");
  const customerDocument = digits(text(data, "customerDocument"));
  const customerEmail = text(data, "customerEmail");
  const customerPhone = digits(text(data, "customerPhone"));
  if (customerName.length < 2 || ![11, 14].includes(customerDocument.length)) return { error: "Informe nome e CPF/CNPJ do pagador." };
  const [entry] = await db.select({ id: financialEntries.id, description: financialEntries.description, amountInCents: financialEntries.amountInCents, dueDate: financialEntries.dueDate, clientId: financialEntries.clientId, clientEmail: clients.email, clientPhone: clients.phone }).from(financialEntries).leftJoin(clients, eq(clients.id, financialEntries.clientId)).where(and(eq(financialEntries.id, financialEntryId), eq(financialEntries.organizationId, organization.id), eq(financialEntries.type, "receivable"), eq(financialEntries.status, "pending"))).limit(1);
  if (!entry) return { error: "Selecione uma conta a receber pendente." };
  const [active] = await db.select({ id: paymentCharges.id }).from(paymentCharges).where(and(eq(paymentCharges.financialEntryId, entry.id), eq(paymentCharges.status, "pending"))).orderBy(desc(paymentCharges.createdAt)).limit(1);
  if (active) return { error: "Este lançamento já possui um pagamento pendente." };
  const credential = await getPagBankCredential(organization.id);
  const chargeId = crypto.randomUUID();
  const expiration = new Date(`${entry.dueDate}T23:59:59-03:00`).toISOString();
  const phone = customerPhone || digits(entry.clientPhone ?? "");
  let order: PagBankOrder;
  try {
    order = await pagBankRequest<PagBankOrder>("/orders", credential, { method: "POST", idempotencyKey: chargeId, body: {
      reference_id: `charge:${chargeId}`,
      customer: { name: customerName, email: customerEmail || entry.clientEmail || undefined, tax_id: customerDocument, ...(phone.length >= 10 ? { phones: [{ country: "55", area: phone.slice(-11, -9), number: phone.slice(-9), type: "MOBILE" }] } : {}) },
      items: [{ reference_id: entry.id, name: entry.description.slice(0, 100), quantity: 1, unit_amount: entry.amountInCents }],
      qr_codes: [{ amount: { value: entry.amountInCents }, expiration_date: expiration }],
      notification_urls: [`${appUrl()}/api/webhooks/pagbank?organizationId=${organization.id}`],
    } });
  } catch (error) { return { error: message(error, "Não foi possível criar o Pix PagBank.") }; }
  const qr = order.qr_codes?.[0];
  const imageUrl = qr?.links?.find((link) => link.media === "image/png" || link.rel === "QRCODE.PNG")?.href;
  let image: string | null = null;
  if (imageUrl) {
    try { const response = await fetch(imageUrl, { headers: { Authorization: `Bearer ${credential.token}` }, cache: "no-store" }); if (response.ok) image = Buffer.from(await response.arrayBuffer()).toString("base64"); } catch { /* QR textual continua disponível */ }
  }
  await db.transaction(async (tx) => {
    await tx.insert(paymentCharges).values({ id: chargeId, organizationId: organization.id, provider: "pagbank", providerPaymentId: order.id, originType: entry.clientId ? "client" : "financial", originId: entry.clientId ?? entry.id, financialEntryId: entry.id, clientId: entry.clientId, paymentMethod: "pix", status: "pending", amountInCents: entry.amountInCents, description: entry.description, customerName, customerDocument, customerEmail: customerEmail || entry.clientEmail, customerPhone: customerPhone || entry.clientPhone, dueDate: entry.dueDate, invoiceUrl: imageUrl, pixQrCodePayload: qr?.text, pixQrCodeImage: image, metadata: { qrCodeId: qr?.id ?? null }, createdByUserId: session.user.id });
    await tx.insert(paymentChargeEvents).values({ organizationId: organization.id, chargeId, eventType: "PAGBANK_ORDER_CREATED", status: "pending", payload: { orderId: order.id } });
  });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "create", entityType: "payment_charge:pagbank", entityId: chargeId, details: { orderId: order.id, amountInCents: entry.amountInCents } });
  refresh();
}
