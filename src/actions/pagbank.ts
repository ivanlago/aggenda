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
type PagBankCheckout = {
  id: string;
  reference_id?: string;
  recurrence_plan?: { id?: string };
  links?: Array<{ rel?: string; href?: string; method?: string }>;
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
  const metadata = { accountName: "Conta PagBank", billingOwner: "client", webhookStatus, testedAt: new Date().toISOString(), capabilities: ["pix", "boleto", "credit_card", "installment", "recurring", "cancel", "refund"] };
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
  const requestedPaymentMethod = ["pix", "boleto", "credit_card", "link"].includes(text(data, "paymentMethod")) ? text(data, "paymentMethod") : "link";
  const chargeMode = ["single", "installment", "recurring"].includes(text(data, "chargeMode")) ? text(data, "chargeMode") : "single";
  const installmentCount = Math.min(12, Math.max(2, Number(text(data, "installmentCount")) || 2));
  if (customerName.length < 2 || ![11, 14].includes(customerDocument.length)) return { error: "Informe nome e CPF/CNPJ do pagador." };
  const [entry] = await db.select({ id: financialEntries.id, description: financialEntries.description, amountInCents: financialEntries.amountInCents, dueDate: financialEntries.dueDate, clientId: financialEntries.clientId, clientEmail: clients.email, clientPhone: clients.phone }).from(financialEntries).leftJoin(clients, eq(clients.id, financialEntries.clientId)).where(and(eq(financialEntries.id, financialEntryId), eq(financialEntries.organizationId, organization.id), eq(financialEntries.type, "receivable"), eq(financialEntries.status, "pending"))).limit(1);
  if (!entry) return { error: "Selecione uma conta a receber pendente." };
  const [active] = await db.select({ id: paymentCharges.id }).from(paymentCharges).where(and(eq(paymentCharges.financialEntryId, entry.id), eq(paymentCharges.status, "pending"))).orderBy(desc(paymentCharges.createdAt)).limit(1);
  if (active) return { error: "Este lançamento já possui um pagamento pendente." };
  const credential = await getPagBankCredential(organization.id);
  const chargeId = crypto.randomUUID();
  const expiration = new Date(`${entry.dueDate}T23:59:59-03:00`).toISOString();
  const phone = customerPhone || digits(entry.clientPhone ?? "");
  const webhookUrl = `${appUrl()}/api/webhooks/pagbank?organizationId=${organization.id}`;
  const paymentMethod = chargeMode === "recurring" || chargeMode === "installment" ? "credit_card" : requestedPaymentMethod;
  const availableMethods = paymentMethod === "link" ? ["PIX", "BOLETO", "CREDIT_CARD"] : [paymentMethod === "pix" ? "PIX" : paymentMethod === "boleto" ? "BOLETO" : "CREDIT_CARD"];
  const methods = availableMethods;
  let checkout: PagBankCheckout;
  try {
    checkout = await pagBankRequest<PagBankCheckout>("/checkouts", credential, { method: "POST", idempotencyKey: chargeId, body: {
      reference_id: `charge:${chargeId}`,
      expiration_date: expiration,
      customer: { name: customerName, email: customerEmail || entry.clientEmail || undefined, tax_id: customerDocument, ...(phone.length >= 10 ? { phone: { country: "+55", area: phone.slice(-11, -9), number: phone.slice(-9) } } : {}) },
      customer_modifiable: true,
      items: [{ reference_id: entry.id, name: entry.description.slice(0, 100), quantity: 1, unit_amount: entry.amountInCents }],
      payment_methods: methods.map((type) => ({ type })),
      ...(methods.includes("CREDIT_CARD") && chargeMode !== "recurring" ? { payment_methods_configs: [{ type: "CREDIT_CARD", config_options: [{ option: "INSTALLMENTS_LIMIT", value: String(chargeMode === "installment" ? installmentCount : 1) }] }] } : {}),
      ...(chargeMode === "recurring" ? { recurrence_plan: { name: entry.description.slice(0, 100), interval: { unit: "MONTH", length: 1 } } } : {}),
      redirect_url: `${appUrl()}/financeiro/cobrancas`,
      return_url: `${appUrl()}/financeiro/cobrancas`,
      redirect_waiting_time: 5,
      notification_urls: [webhookUrl],
      payment_notification_urls: [webhookUrl],
    } });
  } catch (error) { return { error: message(error, "Não foi possível criar o Checkout PagBank.") }; }
  const paymentUrl = checkout.links?.find((link) => link.rel === "PAY")?.href;
  if (!paymentUrl) return { error: "O PagBank criou o checkout sem fornecer o link de pagamento." };
  await db.transaction(async (tx) => {
    await tx.insert(paymentCharges).values({ id: chargeId, organizationId: organization.id, provider: "pagbank", providerPaymentId: checkout.id, providerSubscriptionId: checkout.recurrence_plan?.id, originType: entry.clientId ? "client" : "financial", originId: entry.clientId ?? entry.id, financialEntryId: entry.id, clientId: entry.clientId, paymentMethod, chargeMode, installmentCount: chargeMode === "installment" ? installmentCount : 1, status: "pending", amountInCents: entry.amountInCents, description: entry.description, customerName, customerDocument, customerEmail: customerEmail || entry.clientEmail, customerPhone: customerPhone || entry.clientPhone, dueDate: entry.dueDate, invoiceUrl: paymentUrl, metadata: { checkoutId: checkout.id, recurrencePlanId: checkout.recurrence_plan?.id ?? null }, createdByUserId: session.user.id });
    await tx.insert(paymentChargeEvents).values({ organizationId: organization.id, chargeId, eventType: "PAGBANK_CHECKOUT_CREATED", status: "pending", payload: { checkoutId: checkout.id, paymentMethod, chargeMode, installmentCount } });
  });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "create", entityType: "payment_charge:pagbank", entityId: chargeId, details: { checkoutId: checkout.id, amountInCents: entry.amountInCents, paymentMethod, chargeMode } });
  refresh();
}

export async function cancelPagBankCharge(charge: typeof paymentCharges.$inferSelect, userId: string) {
  const metadata = (charge.metadata ?? {}) as Record<string, unknown>;
  const checkoutId = String(metadata.checkoutId ?? (charge.providerPaymentId?.startsWith("CHEC_") ? charge.providerPaymentId : ""));
  if (!checkoutId) throw new Error("Identificador do Checkout PagBank não encontrado.");
  await pagBankRequest(`/checkouts/${encodeURIComponent(checkoutId)}/inactivate`, await getPagBankCredential(charge.organizationId), { method: "POST" });
  const now = new Date();
  await db.update(paymentCharges).set({ status: "cancelled", cancelledAt: now, updatedAt: now }).where(eq(paymentCharges.id, charge.id));
  await db.insert(paymentChargeEvents).values({ organizationId: charge.organizationId, chargeId: charge.id, eventType: "PAGBANK_CHECKOUT_INACTIVATED", previousStatus: charge.status, status: "cancelled", payload: { checkoutId } });
  await writeAuditLog({ organizationId: charge.organizationId, userId, action: "cancel", entityType: "payment_charge:pagbank", entityId: charge.id, details: { checkoutId } });
  refresh();
}

export async function refundPagBankCharge(charge: typeof paymentCharges.$inferSelect, userId: string) {
  if (!charge.providerPaymentId?.startsWith("CHAR_")) throw new Error("A cobrança PagBank ainda não possui um pagamento elegível para estorno.");
  await pagBankRequest(`/charges/${encodeURIComponent(charge.providerPaymentId)}/cancel`, await getPagBankCredential(charge.organizationId), { method: "POST", body: { amount: { value: charge.amountInCents } } });
  await db.insert(paymentChargeEvents).values({ organizationId: charge.organizationId, chargeId: charge.id, eventType: "PAGBANK_REFUND_REQUESTED", previousStatus: charge.status, status: charge.status, payload: { providerChargeId: charge.providerPaymentId, amountInCents: charge.amountInCents } });
  await writeAuditLog({ organizationId: charge.organizationId, userId, action: "refund_requested", entityType: "payment_charge:pagbank", entityId: charge.id, details: { providerChargeId: charge.providerPaymentId } });
  refresh();
}
