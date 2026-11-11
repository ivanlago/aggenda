"use server";

import { failFinancialCharge, finishFinancialCharge, reserveFinancialCharge } from "@/lib/financial-charge-issuance";
import { onlineInstallmentTerms, hostedPaymentTypes, pagBankCardConfig, pagBankInstallmentPolicy, onlineInstallmentRules, pagBankSaleRules } from "@/lib/payment-catalog-policy";
import { resolveOrganizationPayment } from "@/lib/payment-methods";


import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { clients, financialEntries, organizationFinancialIntegrations, organizations, paymentChargeEvents, paymentCharges } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { encryptFinancialCredential } from "@/lib/financial-secret";
import { getPagBankCredential, pagBankRequest } from "@/lib/pagbank";
import { assertOrganizationPermission, hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";
import { posConnectionGuard } from "@/lib/pos-connection-guard";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const digits = (value: string) => value.replace(/\D/g, "");
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
const refresh = () => { revalidatePath("/financeiro/lancamentos"); revalidatePath("/configuracoes"); };
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
  const posError = await posConnectionGuard(organization.id, "pagbank", {secret:token,environment});
  if (posError) return {error:posError};
  try { await pagBankRequest<PublicKey>("/public-keys/card", { token, environment }); }
  catch (error) { return { error: message(error, "Não foi possível validar o token PagBank.") }; }
  const webhookStatus = appUrl().startsWith("https://") ? "configured" : "pending_https";
  const metadata = { accountName: "Conta PagBank", billingOwner: "client", webhookStatus, testedAt: new Date().toISOString(), capabilities: ["pix", "boleto", "credit_card", "installment", "recurring", "cancel", "refund"] };
  await db.insert(organizationFinancialIntegrations).values({ organizationId: organization.id, provider: "pagbank", environment, encryptedCredential: encryptFinancialCredential(JSON.stringify({ token })), status: "active", metadata }).onConflictDoUpdate({ target: [organizationFinancialIntegrations.organizationId, organizationFinancialIntegrations.provider], set: { environment, encryptedCredential: encryptFinancialCredential(JSON.stringify({ token })), status: "active", metadata: sql`coalesce(${organizationFinancialIntegrations.metadata}, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb`, updatedAt: new Date() } });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "connect_and_test", entityType: "financial_integration:pagbank", details: { environment, webhookStatus } });
  refresh();
}

export async function saveOnlineInstallmentPolicy(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "integrations.manage");
  const useProviderMaximum = data.get("useProviderMaximum") === "on";
  const policy = pagBankInstallmentPolicy(useProviderMaximum ? 24 : Number(text(data, "maximum")), Number(text(data, "interestFree")), 24);
  if (!policy) return { error: "Informe de 1 a 24 parcelas e um limite sem juros entre zero e o máximo." };
  const minimum = text(data, "minimum").replace(",", ".");
  const minimumInCents = Math.round(Number(minimum) * 100);
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(minimum) || minimumInCents < 1) return { error: "Informe um valor mínimo por parcela maior que zero." };
  const values = {
    maxCardInstallments: policy.maximum,
    interestFreeCardInstallments: policy.interestFree,
    minimumCardInstallmentInCents: minimumInCents,
    allowCardBuyerInterest: data.get("allowBuyerInterest") === "on",
    useProviderMaximum,
  };
  await db.update(organizations).set({ onlineInstallmentPolicy: values, updatedAt: new Date() }).where(eq(organizations.id, organization.id));
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "set_card_installments", entityType: "organization", entityId: organization.id, details: values });
  refresh();
  revalidatePath("/vendas");
}

type FeePlan = {
  installments: number;
  installment_value: number;
  amount: { value: number; currency: string; fees?: { seller?: { total?: number } } };
};

export async function simulatePagBankInstallments(data: FormData) {
  const { organization } = await requireOrganization();
  const scope = text(data, "scope");
  if (scope === "receivable") assertOrganizationPermission(organization.role, "finance.manage");
  else if (scope === "pos") {
    if (!hasOrganizationPermission(organization.role, "inventory.manage")) assertOrganizationPermission(organization.role, "sales.sell");
  } else return { error: "Origem da simulação inválida." };
  const amount = Number(text(data, "amountInCents"));
  const bin = text(data, "bin");
  if (!/^\d{6}$/.test(bin) || !Number.isSafeInteger(amount) || amount < 500 || amount > 999_999_999) {
    return { error: "Informe os seis primeiros dígitos do cartão e confira o valor da cobrança." };
  }
  try {
    const credential = await getPagBankCredential(organization.id);
    const rules = pagBankSaleRules(onlineInstallmentRules(organization.onlineInstallmentPolicy), data, hasOrganizationPermission(organization.role, "integrations.manage"));
    const terms = onlineInstallmentTerms(rules, amount, "pagbank");
    const query = new URLSearchParams({
      payment_methods: "CREDIT_CARD", value: String(amount), credit_card_bin: bin,
      max_installments: String(terms.maximum), max_installments_no_interest: String(terms.interestFree), show_seller_fees: "true",
    });
    const response = await pagBankRequest<{ payment_methods?: { credit_card?: Record<string, { installment_plans?: FeePlan[] }> } }>(
      "/charges/fees/calculate?" + query, credential,
    );
    const plans = Object.entries(response.payment_methods?.credit_card ?? {}).flatMap(([brand, result]) =>
      (result.installment_plans ?? []).filter(plan => Number.isInteger(plan.installments) && plan.installments >= 1 && plan.installments <= terms.maximum
        && Number.isSafeInteger(plan.installment_value) && plan.installment_value > 0
        && plan.amount?.currency === "BRL" && Number.isSafeInteger(plan.amount.value) && plan.amount.value >= amount
        && ((rules.allowBuyerInterest && plan.installments > terms.interestFree) || plan.amount.value === amount)
      ).map(plan => {
        const fee = plan.amount.fees?.seller?.total;
        return { brand, count: plan.installments, installment: plan.installment_value, total: plan.amount.value,
          sellerFee: typeof fee === "number" && Number.isSafeInteger(fee) && fee >= 0 && fee <= amount ? fee : null };
      }),
    );
    if (!plans.length) return { error: "O PagBank não retornou condições para este cartão." };
    return { plans, amount, quotedAt: new Date().toISOString(), sandbox: credential.environment !== "production" };
  } catch {
    return { error: "Não foi possível simular agora. O comprador poderá conferir as condições no checkout." };
  }
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
  const posError = await posConnectionGuard(organization.id, "pagbank");
  if (posError) return {error:posError};
  await db.update(organizationFinancialIntegrations).set({ status: "disconnected", isDefaultPos:false, updatedAt: new Date() }).where(and(eq(organizationFinancialIntegrations.organizationId, organization.id), eq(organizationFinancialIntegrations.provider, "pagbank")));
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "disconnect", entityType: "financial_integration:pagbank" });
  refresh();
}

export async function createPagBankCharge(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.manage");
  const selectedPayment = await resolveOrganizationPayment(organization.id, text(data, "paymentMethod"), text(data, "accountId"), "pagbank");
  const financialEntryId = text(data, "financialEntryId");
  const customerName = text(data, "customerName");
  const customerDocument = digits(text(data, "customerDocument"));
  const customerEmail = text(data, "customerEmail");
  const customerPhone = digits(text(data, "customerPhone"));
  const requestedPaymentMethod = selectedPayment.method;
  const chargeMode = ["single", "installment", "recurring"].includes(text(data, "chargeMode")) ? text(data, "chargeMode") : "single";
  if (customerName.length < 2 || ![11, 14].includes(customerDocument.length)) return { error: "Informe nome e CPF/CNPJ do pagador." };
  const [entry] = await db.select({ id: financialEntries.id, description: financialEntries.description, amountInCents: financialEntries.amountInCents, dueDate: financialEntries.dueDate, clientId: financialEntries.clientId, clientEmail: clients.email, clientPhone: clients.phone }).from(financialEntries).leftJoin(clients, eq(clients.id, financialEntries.clientId)).where(and(eq(financialEntries.id, financialEntryId), eq(financialEntries.organizationId, organization.id), eq(financialEntries.type, "receivable"), eq(financialEntries.status, "pending"))).limit(1);
  if (!entry) return { error: "Selecione uma conta a receber pendente." };
  const credential = await getPagBankCredential(organization.id);
  let cardTerms = { maximum: 1, interestFree: 0 };
  if (chargeMode === "installment") {
    const rules = pagBankSaleRules(onlineInstallmentRules(organization.onlineInstallmentPolicy), data, hasOrganizationPermission(organization.role, "integrations.manage"));
    const requested = text(data, "installmentCount");
    cardTerms = onlineInstallmentTerms(requested ? { ...rules, useProviderMaximum: false, maximum: Math.min(rules.useProviderMaximum ? 12 : rules.maximum, Math.max(1, Math.trunc(Number(requested) || 1))) } : rules, entry.amountInCents, "pagbank");
    if (cardTerms.maximum < 2) return { error: "As condições desta cobrança permitem apenas pagamento à vista." };
  }
  const installmentCount = cardTerms.maximum;
  const chargeId = crypto.randomUUID();
  const expiration = new Date(`${entry.dueDate}T23:59:59-03:00`).toISOString();
  const phone = customerPhone || digits(entry.clientPhone ?? "");
  const webhookUrl = `${appUrl()}/api/webhooks/pagbank?organizationId=${organization.id}`;
  if (chargeMode !== "single" && !["credit_card", "link"].includes(requestedPaymentMethod)) return { error: "Parcelamento e recorrência exigem uma forma de cartão ou link cadastrada." };
  const paymentMethod = chargeMode === "recurring" || chargeMode === "installment" ? "credit_card" : requestedPaymentMethod;
  const availableMethods = hostedPaymentTypes("pagbank", paymentMethod);
  const methods = availableMethods;
  const reservation = await reserveFinancialCharge({
    id: chargeId, organizationId: organization.id, provider: "pagbank",
    originType: entry.clientId ? "client" : "financial", originId: entry.clientId ?? entry.id, financialEntryId: entry.id, clientId: entry.clientId,
    amountInCents: entry.amountInCents, description: entry.description, dueDate: entry.dueDate, createdByUserId: session.user.id,
    paymentMethod, chargeMode, installmentCount: chargeMode === "installment" ? installmentCount : 1, customerName, customerDocument, customerEmail: customerEmail || entry.clientEmail, customerPhone: customerPhone || entry.clientPhone,
  }, selectedPayment);
  if (reservation) return reservation;
  let checkout: PagBankCheckout;
  try {
    checkout = await pagBankRequest<PagBankCheckout>("/checkouts", credential, { method: "POST", idempotencyKey: chargeId, body: {
      reference_id: `charge:${chargeId}`,
      expiration_date: expiration,
      customer: { name: customerName, email: customerEmail || entry.clientEmail || undefined, tax_id: customerDocument, ...(phone.length >= 10 ? { phone: { country: "+55", area: phone.slice(-11, -9), number: phone.slice(-9) } } : {}) },
      customer_modifiable: true,
      items: [{ reference_id: entry.id, name: entry.description.slice(0, 100), quantity: 1, unit_amount: entry.amountInCents }],
      payment_methods: methods.map((type) => ({ type })),
      ...(methods.includes("CREDIT_CARD") && chargeMode !== "recurring" ? { payment_methods_configs: pagBankCardConfig(cardTerms.maximum, cardTerms.interestFree) } : {}),
      ...(chargeMode === "recurring" ? { recurrence_plan: { name: entry.description.slice(0, 100), interval: { unit: "MONTH", length: 1 } } } : {}),
      redirect_url: `${appUrl()}/financeiro/cobrancas`,
      return_url: `${appUrl()}/financeiro/cobrancas`,
      redirect_waiting_time: 5,
      notification_urls: [webhookUrl],
      payment_notification_urls: [webhookUrl],
    } });
  } catch (error) { return failFinancialCharge(chargeId, error); }
  const paymentUrl = checkout?.links?.find((link) => link.rel === "PAY")?.href;
  if (!checkout?.id || !paymentUrl) return failFinancialCharge(chargeId, null);
  await db.transaction(async (tx) => {
    await finishFinancialCharge(tx, chargeId, { providerPaymentId: checkout.id, providerSubscriptionId: checkout.recurrence_plan?.id, invoiceUrl: paymentUrl, metadata: { checkoutId: checkout.id, recurrencePlanId: checkout.recurrence_plan?.id ?? null } });
    await tx.insert(paymentChargeEvents).values({ organizationId: organization.id, chargeId, eventType: "PAGBANK_CHECKOUT_CREATED", status: "pending", payload: { checkoutId: checkout.id, paymentMethod, chargeMode, installmentCount } });
  });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "create", entityType: "payment_charge:pagbank", entityId: chargeId, details: { checkoutId: checkout.id, amountInCents: entry.amountInCents, paymentMethod, chargeMode } });
  refresh();
  return { chargeId };
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
