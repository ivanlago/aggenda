"use server";

import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { clients, financialEntries, organizationFinancialIntegrations, outboxEvents, paymentChargeEvents, paymentCharges, whatsappChannels } from "@/db/schema";
import { organizationAsaasRequest } from "@/lib/asaas";
import { writeAuditLog } from "@/lib/audit";
import { encryptFinancialCredential } from "@/lib/financial-secret";
import { getOrganizationAsaasCredential } from "@/lib/organization-asaas";
import { cancelPagBankCharge, refundPagBankCharge } from "@/actions/pagbank";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const digits = (value: string) => value.replace(/\D/g, "");
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const money = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
type Credential = Awaited<ReturnType<typeof getOrganizationAsaasCredential>>;
type AsaasAccount = { id?: string; name?: string; walletId?: string };
type AsaasCustomerList = { data?: Array<{ id: string }> };
type AsaasCustomer = { id: string };
type AsaasPayment = { id: string; invoiceUrl?: string; bankSlipUrl?: string };
type AsaasSubscription = { id: string };
type AsaasPix = { encodedImage?: string; payload?: string };
type AsaasBankSlip = { identificationField?: string };
type AsaasWebhook = { id: string };

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message.slice(0, 500) : fallback;
function revalidateCharges() { revalidatePath("/financeiro"); revalidatePath("/financeiro/cobrancas"); }

export async function connectAsaasAccount(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "integrations.manage");
  const apiKey = text(data, "credential");
  const environment = text(data, "environment") === "production" ? "production" : "sandbox";
  if (apiKey.length < 20) return { error: "Informe uma chave API Asaas válida." };
  let account: AsaasAccount;
  try { account = await organizationAsaasRequest<AsaasAccount>("/myAccount", { apiKey, environment }); }
  catch (error) { return { error: errorMessage(error, "Não foi possível validar a conta Asaas.") }; }
  const webhookToken = randomBytes(32).toString("base64url");
  let webhookId: string | null = null; let webhookStatus = "pending_https"; let webhookError: string | null = null;
  if (appUrl().startsWith("https://")) {
    try {
      const webhook = await organizationAsaasRequest<AsaasWebhook>("/webhooks", { apiKey, environment }, { method: "POST", body: { name: "Aggenda - pagamentos", url: `${appUrl()}/api/webhooks/asaas`, email: session.user.email, enabled: true, interrupted: false, apiVersion: 3, authToken: webhookToken, sendType: "SEQUENTIALLY", events: ["PAYMENT_CREATED", "PAYMENT_UPDATED", "PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "PAYMENT_OVERDUE", "PAYMENT_DELETED", "PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED"] } });
      webhookId = webhook.id; webhookStatus = "active";
    } catch (error) { webhookStatus = "error"; webhookError = errorMessage(error, "Falha ao cadastrar webhook."); }
  }
  const status = webhookStatus === "error" ? "attention" : "active";
  const metadata = { billingOwner: "client", costsPaidBy: "client", accountId: account.id ?? null, accountName: account.name ?? null, walletId: account.walletId ?? null, webhookId, webhookStatus, webhookError, testedAt: new Date().toISOString() };
  await db.insert(organizationFinancialIntegrations).values({ organizationId: organization.id, provider: "asaas", environment, encryptedCredential: encryptFinancialCredential(JSON.stringify({ apiKey, webhookToken })), status, metadata }).onConflictDoUpdate({ target: [organizationFinancialIntegrations.organizationId, organizationFinancialIntegrations.provider], set: { environment, encryptedCredential: encryptFinancialCredential(JSON.stringify({ apiKey, webhookToken })), status, metadata, updatedAt: new Date() } });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "connect_and_test", entityType: "financial_integration:asaas", details: { environment, webhookStatus } });
  revalidateCharges();
  if (webhookStatus === "error") return { error: `Conta validada, mas o webhook requer atenção: ${webhookError}` };
}

export async function testAsaasIntegration() {
  const { session, organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "integrations.manage");
  try {
    const credential = await getOrganizationAsaasCredential(organization.id, { allowAttention: true });
    const account = await organizationAsaasRequest<AsaasAccount>("/myAccount", credential);
    const [integration] = await db.select().from(organizationFinancialIntegrations).where(and(eq(organizationFinancialIntegrations.organizationId, organization.id), eq(organizationFinancialIntegrations.provider, "asaas"))).limit(1);
    await db.update(organizationFinancialIntegrations).set({ metadata: { ...(integration.metadata ?? {}), accountId: account.id ?? null, accountName: account.name ?? null, testedAt: new Date().toISOString(), lastTestStatus: "success" }, updatedAt: new Date() }).where(eq(organizationFinancialIntegrations.id, integration.id));
    await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "test", entityType: "financial_integration:asaas" }); revalidateCharges();
  } catch (error) { return { error: errorMessage(error, "Falha no diagnóstico da conta Asaas.") }; }
}

export async function disconnectAsaasAccount() {
  const { session, organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "integrations.manage");
  const [integration] = await db.select().from(organizationFinancialIntegrations).where(and(eq(organizationFinancialIntegrations.organizationId, organization.id), eq(organizationFinancialIntegrations.provider, "asaas"))).limit(1);
  if (!integration) return { error: "Não existe uma conta Asaas conectada." };
  await db.update(organizationFinancialIntegrations).set({ status: "disconnected", metadata: { ...(integration.metadata ?? {}), disconnectedAt: new Date().toISOString() }, updatedAt: new Date() }).where(eq(organizationFinancialIntegrations.id, integration.id));
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "disconnect", entityType: "financial_integration:asaas" }); revalidateCharges();
}

async function ensureCustomer(credential: Credential, input: { name: string; cpfCnpj: string; email?: string; phone?: string }) {
  const found = await organizationAsaasRequest<AsaasCustomerList>(`/customers?cpfCnpj=${encodeURIComponent(input.cpfCnpj)}&limit=1`, credential);
  if (found.data?.[0]) return found.data[0].id;
  return (await organizationAsaasRequest<AsaasCustomer>("/customers", credential, { method: "POST", body: input })).id;
}
async function chargeForOrganization(id: string, organizationId: string) { const [charge] = await db.select().from(paymentCharges).where(and(eq(paymentCharges.id, id), eq(paymentCharges.organizationId, organizationId))).limit(1); return charge; }
async function recordLocalEvent(input: { organizationId: string; chargeId: string; eventType: string; previousStatus?: string | null; status: string; payload?: Record<string, unknown> }) { await db.insert(paymentChargeEvents).values({ organizationId: input.organizationId, chargeId: input.chargeId, eventType: input.eventType, previousStatus: input.previousStatus, status: input.status, payload: input.payload ?? {} }); }

export async function createFinancialCharge(data: FormData) {
  const { session, organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "finance.manage");
  const financialEntryId = text(data, "financialEntryId"); const paymentMethod = text(data, "paymentMethod");
  const chargeMode = ["single", "installment", "recurring"].includes(text(data, "chargeMode")) ? text(data, "chargeMode") : "single";
  const installmentCount = Math.min(24, Math.max(1, Number(text(data, "installmentCount")) || 1));
  const customerName = text(data, "customerName"); const customerDocument = digits(text(data, "customerDocument")); const customerEmail = text(data, "customerEmail") || undefined; const customerPhone = digits(text(data, "customerPhone")) || undefined;
  if (!["pix", "boleto", "link", "credit_card"].includes(paymentMethod)) return { error: "Forma de cobrança inválida." };
  if (customerName.length < 2 || ![11, 14].includes(customerDocument.length)) return { error: "Informe nome e CPF/CNPJ do pagador." };
  const [entry] = await db.select({ id: financialEntries.id, type: financialEntries.type, status: financialEntries.status, description: financialEntries.description, amountInCents: financialEntries.amountInCents, dueDate: financialEntries.dueDate, clientId: financialEntries.clientId, clientEmail: clients.email, clientPhone: clients.phone }).from(financialEntries).leftJoin(clients, eq(clients.id, financialEntries.clientId)).where(and(eq(financialEntries.id, financialEntryId), eq(financialEntries.organizationId, organization.id))).limit(1);
  if (!entry || entry.type !== "receivable" || entry.status !== "pending") return { error: "Selecione uma conta a receber pendente." };
  const [active] = await db.select({ id: paymentCharges.id }).from(paymentCharges).where(and(eq(paymentCharges.financialEntryId, entry.id), eq(paymentCharges.status, "pending"))).orderBy(desc(paymentCharges.createdAt)).limit(1);
  if (active) return { error: "Este lançamento já possui uma cobrança pendente." };
  let credential: Credential; try { credential = await getOrganizationAsaasCredential(organization.id); } catch (error) { return { error: errorMessage(error, "Conecte a conta Asaas.") }; }
  const chargeId = crypto.randomUUID(); let customerId: string;
  try { customerId = await ensureCustomer(credential, { name: customerName, cpfCnpj: customerDocument, email: customerEmail ?? entry.clientEmail ?? undefined, phone: customerPhone ?? entry.clientPhone ?? undefined }); } catch (error) { return { error: errorMessage(error, "Não foi possível cadastrar o pagador.") }; }
  const billingType = paymentMethod === "pix" ? "PIX" : paymentMethod === "boleto" ? "BOLETO" : paymentMethod === "credit_card" ? "CREDIT_CARD" : "UNDEFINED";
  let payment: AsaasPayment | null = null; let subscription: AsaasSubscription | null = null;
  try {
    const common = { customer: customerId, billingType, value: entry.amountInCents / 100, nextDueDate: entry.dueDate, dueDate: entry.dueDate, description: entry.description.slice(0, 500), externalReference: `charge:${chargeId}` };
    if (chargeMode === "recurring") subscription = await organizationAsaasRequest<AsaasSubscription>("/subscriptions", credential, { method: "POST", body: { ...common, cycle: "MONTHLY" } });
    else payment = await organizationAsaasRequest<AsaasPayment>("/payments", credential, { method: "POST", body: chargeMode === "installment" ? { ...common, installmentCount, totalValue: entry.amountInCents / 100, value: undefined } : common });
  } catch (error) { return { error: errorMessage(error, "O Asaas não aceitou a cobrança.") }; }
  let pix: AsaasPix | null = null; let bankSlip: AsaasBankSlip | null = null;
  if (payment && (billingType === "PIX" || billingType === "UNDEFINED")) pix = await organizationAsaasRequest<AsaasPix>(`/payments/${payment.id}/pixQrCode`, credential).catch(() => null);
  if (payment && billingType === "BOLETO") bankSlip = await organizationAsaasRequest<AsaasBankSlip>(`/payments/${payment.id}/identificationField`, credential).catch(() => null);
  await db.transaction(async (tx) => {
    await tx.insert(paymentCharges).values({ id: chargeId, organizationId: organization.id, providerPaymentId: payment?.id, providerSubscriptionId: subscription?.id, providerCustomerId: customerId, originType: entry.clientId ? "client" : "financial", originId: entry.clientId ?? entry.id, financialEntryId: entry.id, clientId: entry.clientId, paymentMethod, chargeMode, installmentCount: chargeMode === "installment" ? installmentCount : 1, status: "pending", amountInCents: entry.amountInCents, description: entry.description, customerName, customerDocument, customerEmail: customerEmail ?? entry.clientEmail, customerPhone: customerPhone ?? entry.clientPhone, dueDate: entry.dueDate, invoiceUrl: payment?.invoiceUrl, bankSlipUrl: payment?.bankSlipUrl, bankSlipIdentificationField: bankSlip?.identificationField, pixQrCodePayload: pix?.payload, pixQrCodeImage: pix?.encodedImage, metadata: { subscriptionCycle: chargeMode === "recurring" ? "MONTHLY" : null }, createdByUserId: session.user.id });
    await tx.insert(paymentChargeEvents).values({ organizationId: organization.id, chargeId, eventType: "charge_created", status: "pending", payload: { providerPaymentId: payment?.id ?? null, providerSubscriptionId: subscription?.id ?? null, billingType, chargeMode, installmentCount } });
  });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "create", entityType: "payment_charge", entityId: chargeId, details: { financialEntryId: entry.id, paymentMethod, chargeMode, amountInCents: entry.amountInCents } }); revalidateCharges();
}

export async function updatePaymentCharge(data: FormData) {
  const { session, organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "finance.manage");
  const charge = await chargeForOrganization(text(data, "id"), organization.id);
  if (charge?.provider !== "asaas") return { error: "Alterações diretas estão disponíveis apenas para pagamentos Asaas nesta versão." };
  if (!charge || !["pending", "overdue"].includes(charge.status) || !charge.providerPaymentId) return { error: "Cobrança não encontrada ou não pode mais ser alterada." };
  const dueDate = text(data, "dueDate"); const description = text(data, "description"); const amountInCents = Math.round(Number(text(data, "amount").replace(/\./g, "").replace(",", ".")) * 100);
  if (!validDate(dueDate) || description.length < 2 || amountInCents < 100) return { error: "Informe descrição, valor e vencimento válidos." };
  const credential = await getOrganizationAsaasCredential(organization.id);
  try { await organizationAsaasRequest(`/payments/${charge.providerPaymentId}`, credential, { method: "PUT", body: { dueDate, description: description.slice(0, 500), value: amountInCents / 100 } }); } catch (error) { return { error: errorMessage(error, "O Asaas não aceitou a alteração.") }; }
  await db.update(paymentCharges).set({ dueDate, description, amountInCents, status: "pending", updatedAt: new Date() }).where(eq(paymentCharges.id, charge.id));
  await recordLocalEvent({ organizationId: organization.id, chargeId: charge.id, eventType: "charge_updated", previousStatus: charge.status, status: "pending", payload: { dueDate, amountInCents } });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "update", entityType: "payment_charge", entityId: charge.id, details: { dueDate, amountInCents } }); revalidateCharges();
}

export async function cancelPaymentCharge(data: FormData) {
  const { session, organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "finance.manage"); const charge = await chargeForOrganization(text(data, "id"), organization.id);
  if (!charge || !["pending", "overdue"].includes(charge.status)) return { error: "Cobrança não encontrada ou já finalizada." };
  if (charge.provider === "pagbank") { try { return await cancelPagBankCharge(charge, session.user.id); } catch (error) { return { error: errorMessage(error, "O PagBank não aceitou o cancelamento.") }; } }
  if (charge.provider !== "asaas") return { error: "Cancelamento direto indisponível para este provedor." };
  const credential = await getOrganizationAsaasCredential(organization.id);
  try { if (charge.providerSubscriptionId) await organizationAsaasRequest(`/subscriptions/${charge.providerSubscriptionId}`, credential, { method: "DELETE" }); else if (charge.providerPaymentId) await organizationAsaasRequest(`/payments/${charge.providerPaymentId}`, credential, { method: "DELETE" }); } catch (error) { return { error: errorMessage(error, "O Asaas não aceitou o cancelamento.") }; }
  await db.update(paymentCharges).set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() }).where(eq(paymentCharges.id, charge.id)); await recordLocalEvent({ organizationId: organization.id, chargeId: charge.id, eventType: "charge_cancelled", previousStatus: charge.status, status: "cancelled" }); await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "cancel", entityType: "payment_charge", entityId: charge.id }); revalidateCharges();
}

export async function refundPaymentCharge(data: FormData) {
  const { session, organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "finance.manage"); const charge = await chargeForOrganization(text(data, "id"), organization.id);
  if (!charge || charge.status !== "paid" || !charge.providerPaymentId) return { error: "Somente uma cobrança paga pode ser estornada." };
  if (charge.provider === "pagbank") { try { return await refundPagBankCharge(charge, session.user.id); } catch (error) { return { error: errorMessage(error, "O PagBank não aceitou o estorno.") }; } }
  if (charge.provider !== "asaas") return { error: "Estorno direto indisponível para este provedor." };
  const credential = await getOrganizationAsaasCredential(organization.id); try { await organizationAsaasRequest(`/payments/${charge.providerPaymentId}/refund`, credential, { method: "POST", body: {} }); } catch (error) { return { error: errorMessage(error, "O Asaas não aceitou o estorno.") }; }
  await recordLocalEvent({ organizationId: organization.id, chargeId: charge.id, eventType: "refund_requested", previousStatus: charge.status, status: charge.status }); await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "refund_requested", entityType: "payment_charge", entityId: charge.id }); revalidateCharges();
}

export async function sendPaymentChargeWhatsApp(data: FormData) {
  const { session, organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "finance.manage"); const charge = await chargeForOrganization(text(data, "id"), organization.id); const phone = digits(charge?.customerPhone ?? ""); const link = charge?.invoiceUrl || charge?.bankSlipUrl;
  if (!charge || !phone || !link) return { error: "A cobrança precisa ter telefone e link de pagamento." };
  const [channel] = await db.select().from(whatsappChannels).where(and(eq(whatsappChannels.organizationId, organization.id), eq(whatsappChannels.isActive, true))).limit(1); if (!channel) return { error: "Conecte o WhatsApp da empresa antes de enviar." };
  const to = phone.startsWith("55") ? phone : `55${phone}`; const amount = money(charge.amountInCents); const dueDate = new Date(`${charge.dueDate}T12:00:00Z`).toLocaleDateString("pt-BR");
  await db.insert(outboxEvents).values({ organizationId: organization.id, eventKey: `whatsapp:payment-charge:${charge.id}:${Date.now()}`, eventType: "whatsapp.template.send", aggregateType: "payment_charge", aggregateId: charge.id, payload: { organizationId: organization.id, channelId: channel.id, phoneNumberId: channel.phoneNumberId, to, notificationKind: "payment_charge", chargeId: charge.id, languageCode: "pt_BR", parameters: [charge.customerName, amount, dueDate, link], preview: `Cobrança de ${amount}, vencimento ${dueDate}: ${link}` } });
  await recordLocalEvent({ organizationId: organization.id, chargeId: charge.id, eventType: "whatsapp_queued", previousStatus: charge.status, status: charge.status, payload: { to: `${to.slice(0, 4)}***${to.slice(-4)}` } }); await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "share_whatsapp", entityType: "payment_charge", entityId: charge.id }); revalidateCharges();
}
