import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizationFinancialIntegrations, paymentCharges, retailSales } from "@/db/schema";
import { getMercadoPagoCredential, mercadoPagoRequest } from "./mercado-pago";
import { checkoutUrlIsSafe, verifyPosPayment, type MercadoPagoPayment } from "./pos-payments-policy";
import { PosPaymentRepository } from "./pos-payment-repository";

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "https://www.aggenda.app.br").replace(/\/$/, "");

export async function getPosCharge(organizationId: string, saleId: string) {
  const [charge] = await db.select().from(paymentCharges).where(and(eq(paymentCharges.organizationId, organizationId),
    eq(paymentCharges.originType, "retail_sale"), eq(paymentCharges.originId, saleId), eq(paymentCharges.provider, "mercado_pago"))).limit(1);
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
export async function ensurePosCheckout(organizationId: string, saleId: string) {
  const charge = await getPosCharge(organizationId, saleId);
  if (charge.invoiceUrl || charge.status !== "pending") return;
  const credential = await credentialForCharge(charge);
  const [sale] = await db.select().from(retailSales).where(and(eq(retailSales.id, saleId), eq(retailSales.organizationId, organizationId))).limit(1);
  if (!sale || sale.status !== "pending_payment") return;
  const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
  const claimed = await db.transaction(async tx => {
    const [current] = await tx.select().from(paymentCharges).where(eq(paymentCharges.id, charge.id)).for("update");
    if (current.invoiceUrl || current.metadata?.checkoutState !== "new") return false;
    await tx.update(paymentCharges).set({ metadata: { ...(current.metadata ?? {}), checkoutState: "creating", expiresAt }, updatedAt: new Date() }).where(eq(paymentCharges.id, charge.id));
    return true;
  });
  if (!claimed) return;
  try {
    const returnUrl = `${appUrl()}/pagamento/venda/${sale.receiptToken}`;
    const preference = await mercadoPagoRequest<{ id: string; init_point?: string; sandbox_init_point?: string }>("/checkout/preferences", credential.accessToken, {
      method: "POST", idempotencyKey: charge.id, body: { items: [{ id: sale.id, title: `Compra #${sale.id.slice(0,8)}`, quantity: 1, currency_id: "BRL", unit_price: sale.totalInCents / 100 }],
        ...(charge.customerEmail ? { payer: { email: charge.customerEmail } } : {}), external_reference: `charge:${charge.id}`,
        notification_url: `${appUrl()}/api/webhooks/mercado-pago?organizationId=${organizationId}`,
        back_urls: { success: returnUrl, pending: returnUrl, failure: returnUrl }, auto_return: "approved", expires: true,
        expiration_date_from: new Date(Date.now() - 60_000).toISOString(), expiration_date_to: expiresAt } });
    const url = credential.environment === "production" ? preference.init_point : preference.sandbox_init_point;
    if (!preference.id || !url || !checkoutUrlIsSafe(url)) throw new Error("Checkout indisponível.");
    await db.transaction(async tx => {
      const [current] = await tx.select().from(paymentCharges).where(eq(paymentCharges.id, charge.id)).for("update");
      await tx.update(paymentCharges).set({ invoiceUrl: url, metadata: { ...(current.metadata ?? {}), checkoutState: "ready", preferenceId: preference.id }, updatedAt: new Date() }).where(eq(paymentCharges.id, charge.id));
    });
  } catch {
    await db.transaction(async tx => {
      const [current] = await tx.select().from(paymentCharges).where(eq(paymentCharges.id, charge.id)).for("update");
      if (!current.invoiceUrl) await tx.update(paymentCharges).set({ metadata: { ...(current.metadata ?? {}), checkoutState: "uncertain", checkoutError: "Não foi possível confirmar a criação do checkout. Não gere outra cobrança para esta venda. Consulte a situação ou contate o suporte." }, updatedAt: new Date() }).where(eq(paymentCharges.id, charge.id));
    });
  }
}

async function searchPayments(charge: Awaited<ReturnType<typeof getPosCharge>>, accessToken: string) {
  const data = await mercadoPagoRequest<{ results: MercadoPagoPayment[]; paging?: { total?: number } }>(`/v1/payments/search?external_reference=${encodeURIComponent(`charge:${charge.id}`)}&sort=date_created&criteria=desc&limit=100`, accessToken);
  if (!Array.isArray(data.results) || (data.paging?.total ?? 0) > 100) throw new Error("A cobrança exige conferência adicional no Mercado Pago.");
  for (const payment of data.results) verifyPosPayment(payment, { chargeId: charge.id, collectorId: String(charge.metadata?.collectorId), environment: String(charge.metadata?.environment), amount: charge.amountInCents });
  return data.results;
}

export async function refreshPosPayment(organizationId: string, saleId: string) {
  const charge = await getPosCharge(organizationId, saleId), credential = await credentialForCharge(charge);
  const payments = await searchPayments(charge, credential.accessToken);
  const repository = new PosPaymentRepository(db);
  for (const payment of payments) await repository.apply(organizationId, charge.id, payment);
}

export async function cancelPosCheckout(organizationId: string, saleId: string, userId: string) {
  const charge = await getPosCharge(organizationId, saleId), credential = await credentialForCharge(charge);
  if (charge.status !== "pending") throw new Error("Confira o pagamento; este checkout não está pendente.");
  const preferenceId = typeof charge.metadata?.preferenceId === "string" ? charge.metadata.preferenceId : null;
  if (preferenceId) {
    await mercadoPagoRequest(`/checkout/preferences/${encodeURIComponent(preferenceId)}`, credential.accessToken, { method: "PUT",
      body: { expires: true, expiration_date_from: new Date(Date.now() - 2 * 86400_000).toISOString(), expiration_date_to: new Date(Date.now() - 60_000).toISOString() } });
  } else if (charge.metadata?.checkoutState !== "new") {
    const expires = Date.parse(String(charge.metadata?.expiresAt ?? ""));
    if (!Number.isFinite(expires) || Date.now() < expires + 5 * 60_000) throw new Error("A criação do checkout está inconclusiva. A reserva será mantida até conferir o provedor ou terminar a vigência da cobrança.");
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
  await repository.cancelUnpaid(organizationId, saleId, userId);
}
