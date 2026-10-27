import { and, eq } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { billingPayments, billingWebhookEvents, commercialContracts, commercialOrders, organizationServicePlans, organizationSubscriptions, pilotInvitations } from "@/db/schema";
import { addCalendarMonths } from "./commercial-catalog";
import { asaasRequest } from "./asaas";
import { commercialQuote } from "./commercial-catalog";
import { usagePeriod } from "./commercial-access";

type Event = { id: string; event: string; checkout?: { id: string; externalReference?: string | null }; payment?: {
  id: string; checkoutSession?: string | null; externalReference?: string | null; value?: number; customer?: string; subscription?: string | null; billingType?: string;
}; subscription?: { id: string; externalReference?: string | null } };

/** Handles only orders created by the new checkout; legacy billing remains separate. */
export async function processCommercialPayment(event: Event, db = defaultDb, updateRecurring: (id: string, value: number) => Promise<unknown> = (id, value) => asaasRequest(`/subscriptions/${encodeURIComponent(id)}`, { method: "PUT", body: { value: value / 100, updatePendingPayments: false } })) {
  const reference = event.payment?.externalReference ?? event.checkout?.externalReference ?? event.subscription?.externalReference;
  const orderId = reference?.startsWith("commercial:") ? reference.slice(11) : null;
  const checkoutId = event.checkout?.id ?? event.payment?.checkoutSession;
  if (!orderId && !checkoutId && !event.subscription && !event.payment?.subscription) return false;
  let [order] = orderId && /^[0-9a-f-]{36}$/i.test(orderId)
    ? await db.select().from(commercialOrders).where(eq(commercialOrders.id, orderId))
    : checkoutId ? await db.select().from(commercialOrders).where(eq(commercialOrders.checkoutId, checkoutId)) : [];
  if (!order && (event.subscription?.id || event.payment?.subscription)) {
    const [subscription] = await db.select().from(organizationSubscriptions).where(eq(organizationSubscriptions.billingSubscriptionId, event.subscription?.id ?? event.payment!.subscription!));
    if (subscription?.billingPlanCode?.startsWith("commercial:")) {
      [order] = await db.select().from(commercialOrders).where(eq(commercialOrders.id, subscription.billingPlanCode.slice(11)));
    }
  }
  if (!order) {
    if (orderId) throw new Error("Pedido comercial não encontrado.");
    return false;
  }
  if (checkoutId && order.checkoutId && order.checkoutId !== checkoutId) throw new Error("Checkout divergente do pedido.");
  const selected = order;
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(commercialOrders).where(eq(commercialOrders.id, selected.id)).for("update");
    const [dedupe] = await tx.insert(billingWebhookEvents).values({ id: event.id, provider: "asaas", type: event.event }).onConflictDoNothing().returning();
    if (!dedupe || current.status === "reversed") return;
    const now = new Date();
    if (event.event === "SUBSCRIPTION_CREATED" || event.event === "SUBSCRIPTION_UPDATED") {
      if (current.quote.kind !== "commercial") throw new Error("Esta oferta não permite recorrência.");
      if (!current.activatedAt) {
        const [active] = await tx.select().from(commercialContracts).where(eq(commercialContracts.organizationId, current.organizationId));
        if (active?.kind !== "trial" && active?.endsAt && active.endsAt > now) throw new Error("Contrato já ativo; concilie a nova recorrência antes de alterar a cobrança.");
        // Keep a pending billing association without granting paid entitlements.
        await tx.update(organizationSubscriptions).set({ billingSubscriptionId: event.subscription?.id,
          billingPlanCode: `commercial:${current.id}`, updatedAt: now }).where(eq(organizationSubscriptions.organizationId, current.organizationId));
        return;
      }
      await tx.update(organizationSubscriptions).set({ billingSubscriptionId: event.subscription?.id, updatedAt: now }).where(and(eq(organizationSubscriptions.organizationId, current.organizationId), eq(organizationSubscriptions.billingPlanCode, `commercial:${current.id}`)));
      return;
    }
    if (["SUBSCRIPTION_INACTIVATED", "SUBSCRIPTION_DELETED"].includes(event.event)) {
      if (!current.activatedAt) {
        await tx.update(organizationSubscriptions).set({ billingSubscriptionId: null, updatedAt: now }).where(and(eq(organizationSubscriptions.organizationId, current.organizationId), eq(organizationSubscriptions.billingPlanCode, `commercial:${current.id}`)));
        return;
      }
      await tx.update(organizationSubscriptions).set({ status: "canceled", cancelAtPeriodEnd: true, updatedAt: now }).where(and(eq(organizationSubscriptions.organizationId, current.organizationId), eq(organizationSubscriptions.billingPlanCode, `commercial:${current.id}`)));
      return;
    }
    const paid = ["CHECKOUT_PAID", "PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(event.event);
    if (!paid) {
      if (["CHECKOUT_CANCELED", "CHECKOUT_EXPIRED"].includes(event.event) && !current.activatedAt) await tx.update(commercialOrders).set({ status: "expired" }).where(eq(commercialOrders.id, current.id));
      if (["PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE"].includes(event.event) && event.payment?.id === current.providerPaymentId) {
        if (current.quote.kind === "addon") {
          const [base] = await tx.select().from(commercialOrders).where(eq(commercialOrders.id, current.quote.contractOrderId));
          const [subscription] = await tx.select().from(organizationSubscriptions).where(eq(organizationSubscriptions.organizationId, current.organizationId));
          if (base?.quote.kind === "commercial" && base.quote.billing?.recurring) {
            if (!subscription?.billingSubscriptionId || subscription.billingPlanCode !== 'commercial:' + base.id) throw new Error("Concilie o estorno do adicional e a recorrência do plano.");
            const restored = commercialQuote(current.quote.baseSelection);
            await updateRecurring(subscription.billingSubscriptionId, restored.amountInCents);
            await tx.update(commercialOrders).set({ quote: { ...base.quote, signatures: false, documents: 0, renewalAmountInCents: restored.amountInCents } }).where(eq(commercialOrders.id, base.id));
          }
          await tx.update(commercialOrders).set({ status: "reversed" }).where(eq(commercialOrders.id, current.id));
          return;
        }
        if (current.quote.kind === "extra") {
          await tx.update(commercialOrders).set({ status: "reversed" }).where(eq(commercialOrders.id, current.id));
          return;
        }
        await tx.update(commercialContracts).set({ endsAt: now }).where(and(eq(commercialContracts.organizationId, current.organizationId), eq(commercialContracts.orderId, current.id)));
        await tx.update(organizationSubscriptions).set({ status: "past_due", updatedAt: now }).where(and(eq(organizationSubscriptions.organizationId, current.organizationId), eq(organizationSubscriptions.billingPlanCode, `commercial:${current.id}`)));
        await tx.update(commercialOrders).set({ status: "reversed" }).where(eq(commercialOrders.id, current.id));
      }
      return;
    }
    if (current.status === "reversed") return;
    if (current.quote.kind !== "commercial" && event.payment?.subscription) throw new Error("Oferta sem recorrência recebeu pagamento de assinatura; conciliação necessária.");
    const [activeContract] = await tx.select().from(commercialContracts).where(eq(commercialContracts.organizationId, current.organizationId)).for("update");
    if (current.quote.kind !== "extra" && current.quote.kind !== "addon" && activeContract?.orderId && activeContract.orderId !== current.id && activeContract.endsAt > now) {
      throw new Error("Pagamento de outro contrato requer conciliação; contratação ativa preservada.");
    }
    const [previousPayment] = event.payment ? await tx.select().from(billingPayments).where(and(eq(billingPayments.provider, "asaas"), eq(billingPayments.providerPaymentId, event.payment.id))) : [];
    if (previousPayment?.status === "paid") { if (previousPayment.organizationId !== current.organizationId || previousPayment.planCode !== `commercial:${current.id}`) throw new Error("Pagamento já vinculado a outro pedido."); return; }
    const renewing = Boolean(current.activatedAt && event.payment?.subscription && event.payment.id !== current.providerPaymentId);
    const expectedAmount = renewing ? current.quote.renewalAmountInCents ?? current.quote.amountInCents : current.quote.amountInCents;
    if (event.payment?.value != null && Math.round(event.payment.value * 100) !== expectedAmount) throw new Error("Valor pago divergente do pedido comercial.");
    if (event.payment) await tx.insert(billingPayments).values({ organizationId: current.organizationId, provider: "asaas", providerPaymentId: event.payment.id,
      planCode: `commercial:${current.id}`, paymentMethod: event.payment.billingType?.toLowerCase(), amountInCents: expectedAmount, status: "paid", paidAt: now })
      .onConflictDoUpdate({ target: [billingPayments.provider, billingPayments.providerPaymentId], set: { status: "paid", paidAt: now } });
    // CHECKOUT_PAID and PAYMENT_CONFIRMED describe the same first purchase.
    const renewal = Boolean(current.activatedAt && current.providerPaymentId && event.payment?.subscription && event.payment.id !== current.providerPaymentId);
    if (current.activatedAt && !renewal) {
      if (event.payment && !current.providerPaymentId) {
        await tx.update(commercialOrders).set({ providerPaymentId: event.payment.id }).where(eq(commercialOrders.id, current.id));
        if (event.payment.subscription && current.quote.kind === "commercial") await tx.update(organizationSubscriptions).set({
          billingSubscriptionId: event.payment.subscription, billingIntervalMonths: 1, cancelAtPeriodEnd: false, updatedAt: now,
        }).where(eq(organizationSubscriptions.organizationId, current.organizationId));
      }
      return;
    }
    const quote = current.quote;
    if (quote.kind === "addon") {
      if (!activeContract || activeContract.kind !== "commercial" || activeContract.orderId !== quote.contractOrderId || activeContract.endsAt.toISOString() !== quote.contractEndsAt || activeContract.endsAt <= now) throw new Error("O plano mudou ou expirou. Concilie o pagamento do adicional com a equipe.");
      const activated = await tx.select().from(commercialOrders).where(and(eq(commercialOrders.organizationId, current.organizationId), eq(commercialOrders.status, "active")));
      if (activated.some(order => order.id !== current.id && order.quote.kind === "addon" && order.quote.contractOrderId === quote.contractOrderId && order.periodEnd && order.periodEnd > now)) throw new Error("Adicional já contratado; concilie o pagamento duplicado.");
      const [base] = await tx.select().from(commercialOrders).where(eq(commercialOrders.id, quote.contractOrderId));
      const [subscription] = await tx.select().from(organizationSubscriptions).where(eq(organizationSubscriptions.organizationId, current.organizationId));
      if (!base || base.quote.kind !== "commercial") throw new Error("Plano de origem indisponível.");
      if (base.quote.billing?.recurring && !subscription?.cancelAtPeriodEnd) {
        if (!subscription?.billingSubscriptionId || subscription.billingPlanCode !== 'commercial:' + base.id) throw new Error("Recorrência do plano não confirmada. Concilie a contratação antes de ativar o adicional.");
        await updateRecurring(subscription.billingSubscriptionId, quote.renewalAmountInCents);
        await tx.update(commercialOrders).set({ quote: { ...base.quote, signatures: true, documents: 50, renewalAmountInCents: quote.renewalAmountInCents } }).where(eq(commercialOrders.id, base.id));
      }
      await tx.update(commercialOrders).set({ status: "active", activatedAt: now, periodEnd: activeContract.endsAt, providerPaymentId: event.payment?.id ?? current.providerPaymentId }).where(eq(commercialOrders.id, current.id));
      return;
    }
    if (quote.kind === "extra") {
      const [contract] = await tx.select().from(commercialContracts).where(eq(commercialContracts.organizationId, current.organizationId)).for("update");
      if (!contract || contract.endsAt <= now) throw new Error("Contrato expirado antes da confirmação do pacote. Necessário conciliar o pagamento com a equipe.");
      const periodStart = new Date(`${usagePeriod(contract.startedAt, now, contract.kind === "trial")}T00:00:00Z`);
      const monthIndex = (periodStart.getUTCFullYear() - contract.startedAt.getUTCFullYear()) * 12 + periodStart.getUTCMonth() - contract.startedAt.getUTCMonth();
      const reset = contract.kind === "trial" ? contract.endsAt : addCalendarMonths(contract.startedAt, monthIndex + 1);
      await tx.update(commercialOrders).set({ status: "active", activatedAt: now, periodEnd: reset < contract.endsAt ? reset : contract.endsAt,
        providerPaymentId: event.payment?.id ?? current.providerPaymentId }).where(eq(commercialOrders.id, current.id));
      return;
    }
    if (current.invitationId && !current.activatedAt) {
      const [invite] = await tx.select().from(pilotInvitations).where(eq(pilotInvitations.id, current.invitationId)).for("update");
      if (!invite || invite.redeemedAt || invite.organizationId !== current.organizationId) throw new Error("Convite já utilizado ou divergente.");
      await tx.update(pilotInvitations).set({ redeemedAt: now }).where(eq(pilotInvitations.id, invite.id));
    }
    const endsAt = addCalendarMonths(renewal && current.periodEnd && current.periodEnd > now ? current.periodEnd : now, quote.months);
    const contract = { organizationId: current.organizationId, orderId: current.id, kind: quote.kind, product: quote.product,
      professionalLimit: quote.professionals, responseLimit: quote.responses, documentLimit: quote.documents, noteLimit: quote.notes,
      startedAt: current.activatedAt ?? now, endsAt };
    await tx.insert(commercialContracts).values(contract).onConflictDoUpdate({ target: commercialContracts.organizationId, set: contract });
    const services = { organizationId: current.organizationId, corePlanCode: "core", whatsappServiceCode: quote.agent,
      whatsappMonthlyLimit: 0, aiMonthlyLimit: 0, nfseServiceCode: quote.notes ? "emitter" : "none", nfseMonthlyLimit: quote.notes };
    await tx.insert(organizationServicePlans).values(services).onConflictDoUpdate({ target: organizationServicePlans.organizationId, set: { ...services, updatedAt: now } });
    const subscription = { organizationId: current.organizationId, plan: "essential" as const, status: "active" as const,
      billingProvider: "asaas", billingPlanCode: `commercial:${current.id}`, billingCheckoutId: current.checkoutId,
      billingCustomerId: event.payment?.customer, billingSubscriptionId: event.payment?.subscription ?? undefined,
      billingIntervalMonths: quote.billing?.recurring || event.payment?.subscription ? 1 : null, currentPeriodEnd: endsAt, trialEndsAt: null,
      lastPaymentId: event.payment?.id, cancelAtPeriodEnd: !(quote.billing?.recurring || event.payment?.subscription), updatedAt: now };
    await tx.insert(organizationSubscriptions).values(subscription).onConflictDoUpdate({ target: organizationSubscriptions.organizationId, set: subscription });
    await tx.update(commercialOrders).set({ status: "active", activatedAt: current.activatedAt ?? now, periodEnd: endsAt,
      providerPaymentId: event.payment?.id ?? current.providerPaymentId }).where(eq(commercialOrders.id, current.id));
  });
  return true;
}
