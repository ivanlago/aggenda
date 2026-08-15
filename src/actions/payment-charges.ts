"use server";

import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { clients, financialEntries, organizationFinancialIntegrations, paymentChargeEvents, paymentCharges } from "@/db/schema";
import { organizationAsaasRequest } from "@/lib/asaas";
import { writeAuditLog } from "@/lib/audit";
import { encryptFinancialCredential } from "@/lib/financial-secret";
import { getOrganizationAsaasCredential } from "@/lib/organization-asaas";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const digits = (value: string) => value.replace(/\D/g, "");

type AsaasAccount = { id?: string; name?: string; email?: string };
type AsaasCustomerList = { data?: Array<{ id: string }> };
type AsaasCustomer = { id: string };
type AsaasPayment = { id: string; status?: string; invoiceUrl?: string; bankSlipUrl?: string };
type AsaasPix = { encodedImage?: string; payload?: string };
type AsaasBankSlip = { identificationField?: string };
type AsaasWebhook = { id: string };

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
}

export async function connectAsaasAccount(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "integrations.manage");
  const apiKey = text(data, "credential");
  const environment = text(data, "environment") === "production" ? "production" : "sandbox";
  if (apiKey.length < 20) return { error: "Informe uma chave API Asaas válida." };
  let account: AsaasAccount;
  try {
    account = await organizationAsaasRequest<AsaasAccount>("/myAccount", { apiKey, environment });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível validar a conta Asaas." };
  }
  const webhookToken = randomBytes(32).toString("base64url");
  let webhookId: string | null = null;
  let webhookStatus = "pending";
  if (appUrl().startsWith("https://")) {
    try {
      const webhook = await organizationAsaasRequest<AsaasWebhook>("/webhooks", { apiKey, environment }, { method: "POST", body: {
        name: "Aggenda - pagamentos",
        url: `${appUrl()}/api/webhooks/asaas`,
        email: session.user.email,
        enabled: true,
        interrupted: false,
        apiVersion: 3,
        authToken: webhookToken,
        sendType: "SEQUENTIALLY",
        events: ["PAYMENT_CREATED", "PAYMENT_UPDATED", "PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "PAYMENT_OVERDUE", "PAYMENT_DELETED", "PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED"],
      } });
      webhookId = webhook.id;
      webhookStatus = "active";
    } catch (error) {
      console.error("[payments] Conta validada, mas webhook não foi criado", error);
      webhookStatus = "error";
    }
  }
  await db.insert(organizationFinancialIntegrations).values({
    organizationId: organization.id,
    provider: "asaas",
    environment,
    encryptedCredential: encryptFinancialCredential(JSON.stringify({ apiKey, webhookToken })),
    status: "active",
    metadata: { billingOwner: "client", costsPaidBy: "client", accountId: account.id ?? null, accountName: account.name ?? null, webhookId, webhookStatus, testedAt: new Date().toISOString() },
  }).onConflictDoUpdate({
    target: [organizationFinancialIntegrations.organizationId, organizationFinancialIntegrations.provider],
    set: { environment, encryptedCredential: encryptFinancialCredential(JSON.stringify({ apiKey, webhookToken })), status: "active", metadata: { billingOwner: "client", costsPaidBy: "client", accountId: account.id ?? null, accountName: account.name ?? null, webhookId, webhookStatus, testedAt: new Date().toISOString() }, updatedAt: new Date() },
  });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "connect_and_test", entityType: "financial_integration:asaas", details: { environment, webhookStatus } });
  revalidatePath("/financeiro/operacoes");
}

async function ensureCustomer(credential: Awaited<ReturnType<typeof getOrganizationAsaasCredential>>, input: { name: string; cpfCnpj: string; email?: string; phone?: string }) {
  const found = await organizationAsaasRequest<AsaasCustomerList>(`/customers?cpfCnpj=${encodeURIComponent(input.cpfCnpj)}&limit=1`, credential);
  if (found.data?.[0]) return found.data[0].id;
  const created = await organizationAsaasRequest<AsaasCustomer>("/customers", credential, { method: "POST", body: input });
  return created.id;
}

export async function createFinancialCharge(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.manage");
  const financialEntryId = text(data, "financialEntryId");
  const paymentMethod = text(data, "paymentMethod");
  const customerName = text(data, "customerName");
  const customerDocument = digits(text(data, "customerDocument"));
  const customerEmail = text(data, "customerEmail") || undefined;
  const customerPhone = digits(text(data, "customerPhone")) || undefined;
  if (!["pix", "boleto", "link"].includes(paymentMethod)) return { error: "Forma de cobrança inválida." };
  if (customerName.length < 2 || ![11, 14].includes(customerDocument.length)) return { error: "Informe nome e CPF/CNPJ do pagador." };
  const [entry] = await db.select({ id: financialEntries.id, type: financialEntries.type, status: financialEntries.status, description: financialEntries.description, amountInCents: financialEntries.amountInCents, dueDate: financialEntries.dueDate, clientName: clients.name, clientEmail: clients.email, clientPhone: clients.phone })
    .from(financialEntries).leftJoin(clients, eq(clients.id, financialEntries.clientId)).where(and(eq(financialEntries.id, financialEntryId), eq(financialEntries.organizationId, organization.id))).limit(1);
  if (!entry || entry.type !== "receivable" || entry.status !== "pending") return { error: "Selecione uma conta a receber pendente." };
  const [active] = await db.select({ id: paymentCharges.id }).from(paymentCharges).where(and(eq(paymentCharges.financialEntryId, entry.id), eq(paymentCharges.status, "pending"))).orderBy(desc(paymentCharges.createdAt)).limit(1);
  if (active) return { error: "Este lançamento já possui uma cobrança pendente." };
  const credential = await getOrganizationAsaasCredential(organization.id);
  const chargeId = crypto.randomUUID();
  const customerId = await ensureCustomer(credential, { name: customerName, cpfCnpj: customerDocument, email: customerEmail ?? entry.clientEmail ?? undefined, phone: customerPhone ?? entry.clientPhone ?? undefined });
  const billingType = paymentMethod === "pix" ? "PIX" : paymentMethod === "boleto" ? "BOLETO" : "UNDEFINED";
  let payment: AsaasPayment;
  try {
    payment = await organizationAsaasRequest<AsaasPayment>("/payments", credential, { method: "POST", body: { customer: customerId, billingType, value: entry.amountInCents / 100, dueDate: entry.dueDate, description: entry.description.slice(0, 500), externalReference: `charge:${chargeId}` } });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "O Asaas não aceitou a cobrança." };
  }
  let pix: AsaasPix | null = null;
  let bankSlip: AsaasBankSlip | null = null;
  if (billingType === "PIX" || billingType === "UNDEFINED") pix = await organizationAsaasRequest<AsaasPix>(`/payments/${payment.id}/pixQrCode`, credential).catch(() => null);
  if (billingType === "BOLETO") bankSlip = await organizationAsaasRequest<AsaasBankSlip>(`/payments/${payment.id}/identificationField`, credential).catch(() => null);
  await db.transaction(async (tx) => {
    await tx.insert(paymentCharges).values({ id: chargeId, organizationId: organization.id, providerPaymentId: payment.id, providerCustomerId: customerId, originType: "financial", originId: entry.id, financialEntryId: entry.id, paymentMethod, status: "pending", amountInCents: entry.amountInCents, description: entry.description, customerName, customerDocument, customerEmail: customerEmail ?? entry.clientEmail, customerPhone: customerPhone ?? entry.clientPhone, dueDate: entry.dueDate, invoiceUrl: payment.invoiceUrl, bankSlipUrl: payment.bankSlipUrl, bankSlipIdentificationField: bankSlip?.identificationField, pixQrCodePayload: pix?.payload, pixQrCodeImage: pix?.encodedImage, createdByUserId: session.user.id });
    await tx.insert(paymentChargeEvents).values({ organizationId: organization.id, chargeId, eventType: "charge_created", status: "pending", payload: { providerPaymentId: payment.id, billingType } });
  });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "create", entityType: "payment_charge", entityId: chargeId, details: { originType: "financial", originId: entry.id, paymentMethod, amountInCents: entry.amountInCents } });
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/operacoes");
}
