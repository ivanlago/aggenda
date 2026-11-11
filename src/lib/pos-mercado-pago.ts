import { mercadoPagoMethodSettings } from "./payment-catalog-policy";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizationFinancialIntegrations, paymentCharges, retailSales } from "@/db/schema";
import { getMercadoPagoCredential, mercadoPagoRequest } from "./mercado-pago";
import { checkoutUrlIsSafe, verifyPosPayment, type MercadoPagoPayment } from "./pos-payments-policy";
import { PosPaymentRepository } from "./pos-payment-repository";
import { ProviderRequestError } from "./provider-request-error";

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "https://www.aggenda.app.br").replace(/\/$/, "");

export async function getPosCharge(organizationId: string, saleId: string, chargeId?: string) {
  const [charge] = await db.select().from(paymentCharges).where(and(eq(paymentCharges.organizationId, organizationId),
    eq(paymentCharges.originType, "retail_sale"), eq(paymentCharges.originId, saleId), eq(paymentCharges.provider, "mercado_pago"), ...(chargeId ? [eq(paymentCharges.id, chargeId)] : []))).limit(1);
  if (!charge) throw new Error("Cobrança integrada não encontrada.");
  return charge;
}

async function credentialForCharge(charge: Awaited<ReturnType<typeof getPosCharge>>) {
  const credential = await getMercadoPagoCredential(charge.organizationId);
  const [integration] = await db.select({ metadata: organizationFinancialIntegrations.metadata }).from(organizationFinancialIntegrations).where(and(
    eq(organizationFinancialIntegrations.organizationId, charge.organizationId), eq(organizationFinancialIntegrations.provider, "mercado_pago"))).limit(1);
  if (String(integration?.metadata?.accountId) !== String(charge.metadata?.collectorId) || credential.environment !== charge.metadata?.environment) throw new Error("A conta ou o ambiente Mercado Pago desta cobrança foi alterado. Restaure a conexão original para consultar.");
  return credential;
}

/** One durable creation attempt; never blindly recreate a preference after timeout. */
export async function ensurePosCheckout(organizationId: string, saleId: string, chargeId?: string) {
  const charge = await getPosCharge(organizationId, saleId, chargeId);
  if (charge.invoiceUrl || charge.status !== "pending") return;
  const credential = await credentialForCharge(charge);
  const [sale] = await db.select().from(retailSales).where(and(eq(retailSales.id, saleId), eq(retailSales.organizationId, organizationId))).limit(1);
  if (!sale || sale.status !== "pending_payment") return;
  const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
  const claimed = await db.transaction(async tx => {
    const [current] = await tx.select().from(paymentCharges).where(eq(paymentCharges.id, charge.id)).for("update");
    if (current.status !== "pending" || current.invoiceUrl || current.metadata?.checkoutState !== "new" || current.metadata?.cancellationRequestedAt) return false;
    await tx.update(paymentCharges).set({ metadata: { ...(current.metadata ?? {}), checkoutState: "creating", expiresAt }, updatedAt: new Date() }).where(eq(paymentCharges.id, charge.id));
    return true;
  });
  if (!claimed) return;
  try {
    const returnUrl = `${appUrl()}/pagamento/venda/${sale.receiptToken}`;
    const preference = await mercadoPagoRequest<{ id: string; init_point?: string; sandbox_init_point?: string }>("/checkout/preferences", credential.accessToken, {
      method: "POST", idempotencyKey: charge.id, body: { payment_methods: { ...mercadoPagoMethodSettings(String(charge.metadata?.catalogPaymentKind ?? "link")), ...(["credit_card", "link"].includes(String(charge.metadata?.catalogPaymentKind)) && typeof charge.metadata?.onlineCardMaximum === "number" ? { installments: charge.metadata.onlineCardMaximum } : {}) }, items: [{ id: sale.id, title: `Compra #${sale.id.slice(0,8)}`, quantity: 1, currency_id: "BRL", unit_price: charge.amountInCents / 100 }],
        ...(charge.customerEmail ? { payer: { email: charge.customerEmail } } : {}), external_reference: `charge:${charge.id}`,
        notification_url: `${appUrl()}/api/webhooks/mercado-pago?organizationId=${organizationId}`,
        back_urls: { success: returnUrl, pending: returnUrl, failure: returnUrl }, auto_return: "approved", expires: true,
        expiration_date_from: new Date(Date.now() - 60_000).toISOString(), expiration_date_to: expiresAt } });
    const url = credential.environment === "production" ? preference.init_point : preference.sandbox_init_point;
    if (!preference.id) throw new Error("Checkout indisponível.");
    const validUrl = url && checkoutUrlIsSafe(url) ? url : null;
    const cancelled = await db.transaction(async tx => {
      const [current] = await tx.select().from(paymentCharges).where(eq(paymentCharges.id, charge.id)).for("update");
      const cancelled = current.status === "cancelled" || Boolean(current.metadata?.cancellationRequestedAt);
      await tx.update(paymentCharges).set({ invoiceUrl: cancelled ? null : validUrl, metadata: { ...(current.metadata ?? {}), checkoutState: cancelled ? "cancelled" : validUrl ? "ready" : "uncertain", preferenceId: preference.id, preferenceExpirationPending: cancelled }, updatedAt: new Date() }).where(eq(paymentCharges.id, charge.id));
      return cancelled;
    });
    if (cancelled) await expireCancelledPreference(charge.id, preference.id, credential.accessToken);
    else if (!validUrl) throw new Error("Checkout indisponível.");
  } catch (error) {
    await db.transaction(async tx => {
      const [current] = await tx.select().from(paymentCharges).where(eq(paymentCharges.id, charge.id)).for("update");
      if (current.status === "cancelled" || current.metadata?.cancellationRequestedAt) return;
      const rejected = error instanceof ProviderRequestError && [400, 401, 403, 404, 422].includes(error.status);
      if (!current.invoiceUrl) await tx.update(paymentCharges).set({ metadata: { ...(current.metadata ?? {}), checkoutState: rejected ? "rejected" : "uncertain", ...(error instanceof ProviderRequestError ? { providerHttpStatus: error.status, providerErrorCode: error.code ?? null } : {}), checkoutError: rejected ? "O Mercado Pago recusou a criação. Cancele esta venda para liberar os produtos e confira a configuração do provedor." : "Não foi possível confirmar a criação do checkout. Consulte a situação ou cancele a venda." }, updatedAt: new Date() }).where(eq(paymentCharges.id, charge.id));
    });
  }
}

async function expirePreference(id: string, accessToken: string) {
  await mercadoPagoRequest(`/checkout/preferences/${encodeURIComponent(id)}`, accessToken, { method: "PUT",
    body: { expires: true, expiration_date_from: new Date(Date.now() - 2 * 86400_000).toISOString(), expiration_date_to: new Date(Date.now() - 60_000).toISOString() } });
}

async function expireCancelledPreference(chargeId: string, preferenceId: string, accessToken: string) {
  await expirePreference(preferenceId, accessToken);
  await db.transaction(async tx => {
    const [current] = await tx.select().from(paymentCharges).where(eq(paymentCharges.id, chargeId)).for("update");
    await tx.update(paymentCharges).set({ metadata: { ...current.metadata, preferenceExpirationPending: false }, updatedAt: new Date() }).where(eq(paymentCharges.id, chargeId));
  });
}

async function findPreferences(charge: Awaited<ReturnType<typeof getPosCharge>>, accessToken: string) {
  const preferences: { id: string }[] = [];
  let offset = 0;
  let total = 0;
  do {
    const data = await mercadoPagoRequest<{ elements?: { id: string }[]; total?: number; next_offset?: number }>(
      `/checkout/preferences/search?external_reference=${encodeURIComponent(`charge:${charge.id}`)}&limit=10&offset=${offset}`, accessToken,
    );
    if (!Array.isArray(data.elements) || typeof data.total !== "number" || !Number.isInteger(data.total) || data.total < 0
        || data.elements.some(preference => typeof preference.id !== "string" || !preference.id)) {
      throw new Error("Não foi possível conferir todos os checkouts desta venda.");
    }
    total = data.total;
    preferences.push(...data.elements);
    if (preferences.length < total && (!data.elements.length || typeof data.next_offset !== "number"
        || !Number.isInteger(data.next_offset) || data.next_offset <= offset)) {
      throw new Error("Não foi possível conferir todos os checkouts desta venda.");
    }
    offset = data.next_offset ?? preferences.length;
  } while (preferences.length < total);
  for (const item of preferences) {
    const detail = await mercadoPagoRequest<{ id: string; external_reference: string; collector_id: number }>(
      `/checkout/preferences/${encodeURIComponent(item.id)}`, accessToken,
    );
    if (detail.id !== item.id || detail.external_reference !== `charge:${charge.id}`
        || String(detail.collector_id) !== String(charge.metadata?.collectorId)) throw new Error("Checkout divergente da venda.");
  }
  return preferences;
}

async function searchPayments(charge: Awaited<ReturnType<typeof getPosCharge>>, accessToken: string) {
  const data = await mercadoPagoRequest<{ results: MercadoPagoPayment[]; paging?: { total?: number } }>(`/v1/payments/search?external_reference=${encodeURIComponent(`charge:${charge.id}`)}&sort=date_created&criteria=desc&limit=100`, accessToken);
  if (!Array.isArray(data.results) || (data.paging?.total ?? 0) > 100) throw new Error("A cobrança exige conferência adicional no Mercado Pago.");
  for (const payment of data.results) verifyPosPayment(payment, { chargeId: charge.id, collectorId: String(charge.metadata?.collectorId), environment: String(charge.metadata?.environment), amount: charge.amountInCents });
  return data.results;
}

export async function refreshPosPayment(organizationId: string, saleId: string, chargeId?: string) {
  const charge = await getPosCharge(organizationId, saleId, chargeId);
  const credential = await credentialForCharge(charge);
  if (charge.metadata?.preferenceExpirationPending && typeof charge.metadata.preferenceId === "string") {
    await expireCancelledPreference(charge.id, charge.metadata.preferenceId, credential.accessToken);
  }
  const payments = await searchPayments(charge, credential.accessToken);
  const repository = new PosPaymentRepository(db);
  for (const payment of payments) await repository.apply(organizationId, charge.id, payment);
}

export async function cancelPosCheckout(organizationId: string, saleId: string, userId: string, chargeId?: string) {
  let charge = await getPosCharge(organizationId, saleId, chargeId);
  const credential = await credentialForCharge(charge);
  if (charge.status === "cancelled") {
    if (charge.metadata?.preferenceExpirationPending && typeof charge.metadata.preferenceId === "string") {
      await expireCancelledPreference(charge.id, charge.metadata.preferenceId, credential.accessToken);
    }
    return;
  }
  if (charge.status !== "pending") throw new Error("Confira o pagamento; este checkout não está pendente.");
  await db.transaction(async tx => {
    const [current] = await tx.select().from(paymentCharges).where(eq(paymentCharges.id, charge.id)).for("update");
    if (current.status !== "pending") return;
    await tx.update(paymentCharges).set({ metadata: { ...current.metadata, cancellationRequestedAt: new Date().toISOString() }, updatedAt: new Date() }).where(eq(paymentCharges.id, charge.id));
  });
  charge = await getPosCharge(organizationId, saleId, chargeId);
  if (charge.status === "cancelled") return;
  if (charge.status !== "pending") throw new Error("Confira o pagamento; este checkout não está pendente.");
  const preferenceId = typeof charge.metadata?.preferenceId === "string" ? charge.metadata.preferenceId : null;
  if (preferenceId) {
    await expirePreference(preferenceId, credential.accessToken);
  } else if (!["new", "rejected"].includes(String(charge.metadata?.checkoutState))) {
    for (const preference of await findPreferences(charge, credential.accessToken)) await expirePreference(preference.id, credential.accessToken);
  }
  const repository = new PosPaymentRepository(db);
  const cancelAttempts = async () => {
    const payments = await searchPayments(charge, credential.accessToken);
    for (const payment of payments) {
      if (["approved", "refunded", "charged_back", "in_mediation"].includes(payment.status)) {
        await repository.apply(organizationId, charge.id, payment);
        throw new Error("O Mercado Pago já processou um pagamento. Atualize a situação e confira antes de cancelar.");
      }
      if (["pending", "in_process", "authorized"].includes(payment.status)) {
        const cancelled = await mercadoPagoRequest<MercadoPagoPayment>(`/v1/payments/${encodeURIComponent(String(payment.id))}`, credential.accessToken, { method: "PUT", body: { status: "cancelled" }, idempotencyKey: `cancel:${charge.id}:${payment.id}` });
        if (cancelled.status !== "cancelled") throw new Error("O Mercado Pago ainda não confirmou o cancelamento. A reserva foi mantida.");
      }
    }
  };
  await cancelAttempts();
  await cancelAttempts();
  await repository.cancelUnpaid(organizationId, saleId, userId, "mercado_pago", charge.id);
}
