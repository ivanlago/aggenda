import { and, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { auditLogs, clientPackages, financialEntries, inventoryMovements, inventoryProducts, organizations,
  paymentChargeEvents, paymentCharges, retailSaleItems, retailSalePayments, retailSales, retailQuotes } from "@/db/schema";
import { restoreLots } from "./inventory-lots";
import { organizationDate } from "./organization-time";
import { checkoutInputHash, paymentCents, posPaymentStatus, verifyPosPayment, type MercadoPagoPayment } from "./pos-payments-policy";

/** Independent of request/session: accepts only provider-verified payment data.
 * Authentication/signature verification and API lookup happen before this adapter. */
export class PosPaymentRepository {
  constructor(private readonly database: typeof db) {}

  async apply(organizationId: string, chargeId: string, payment: MercadoPagoPayment, provider = "mercado_pago") {
    return this.database.transaction(async tx => {
      const [charge] = await tx.select().from(paymentCharges).where(and(eq(paymentCharges.id, chargeId), eq(paymentCharges.organizationId, organizationId),
        eq(paymentCharges.provider, provider), eq(paymentCharges.originType, "retail_sale"))).for("update");
      if (!charge) throw new Error("Cobrança do PDV não encontrada.");
      verifyPosPayment(payment, { chargeId, collectorId: String(charge.metadata?.collectorId ?? ""), environment: String(charge.metadata?.environment ?? ""), amount: charge.amountInCents });
      const [sale] = await tx.select().from(retailSales).where(and(eq(retailSales.id, charge.originId), eq(retailSales.organizationId, organizationId))).for("update");
      if (!sale || sale.paymentProvider !== provider || sale.totalInCents !== charge.amountInCents) throw new Error("Venda divergente da cobrança.");
      const refund = paymentCents(payment.transaction_amount_refunded ?? 0);
      if (refund === null || refund > charge.amountInCents) throw new Error("Valor de estorno inválido.");
      const eventId = `pos-${provider}:${payment.id}:${checkoutInputHash({ status: payment.status, refund, at: payment.date_last_updated ?? null })}`;
      const [event] = await tx.insert(paymentChargeEvents).values({ organizationId, chargeId, providerEventId: eventId,
        eventType: `POS_${provider.toUpperCase()}_${payment.status.toUpperCase()}`, previousStatus: charge.status, status: posPaymentStatus(payment),
        payload: { paymentId: String(payment.id), providerStatus: payment.status, refundedInCents: refund } }).onConflictDoNothing().returning({ id: paymentChargeEvents.id });
      if (!event) return { duplicate: true, status: sale.status };
      const incomingAt = payment.date_last_updated ? Date.parse(payment.date_last_updated) : NaN;
      const observedAt = typeof charge.metadata?.providerUpdatedAt === "string" ? Date.parse(charge.metadata.providerUpdatedAt) : NaN;
      const samePayment = !charge.providerPaymentId || charge.providerPaymentId === String(payment.id);
      if (samePayment && Number.isFinite(incomingAt) && Number.isFinite(observedAt) && incomingAt < observedAt) return { duplicate: false, status: sale.status };
      const status = posPaymentStatus(payment);
      if (status === "pending" || (samePayment && charge.status === "refunded" && status === "paid")) return { duplicate: false, status: sale.status };
      const now = new Date();
      const approvedAt = payment.date_approved ? new Date(payment.date_approved) : now;
      if (!Number.isFinite(approvedAt.getTime())) throw new Error("Data do pagamento inválida.");
      const [org] = await tx.select({ timezone: organizations.timezone }).from(organizations).where(eq(organizations.id, organizationId));
      const method = payment.payment_type_id === "credit_card" ? "credit_card" : payment.payment_type_id === "debit_card" ? "debit_card" : payment.payment_method_id === "pix" ? "pix" : payment.payment_type_id === "ticket" ? "boleto" : provider;
      const settledPaymentId = charge.metadata?.paidPaymentId ?? charge.providerPaymentId;
      const anotherPayment = settledPaymentId && String(settledPaymentId) !== String(payment.id);
      const needsReview = sale.status === "payment_review" || status === "payment_review" || status === "partially_refunded" || Boolean(anotherPayment) || (status === "paid" && (sale.status === "cancelled" || sale.stockRestoredAt));
      const saleStatus = needsReview ? "payment_review" : status === "paid" ? "completed" : "refunded";
      const summary = { grossInCents: charge.amountInCents, refundedInCents: refund,
        feeInCents: payment.fee_details?.reduce((sum, item) => sum + (paymentCents(item.amount) ?? 0), 0) ?? null,
        netInCents: paymentCents(payment.transaction_details?.net_received_amount), method, approvedAt: approvedAt.toISOString() };
      await tx.update(paymentCharges).set({ status: needsReview ? "payment_review" : status, providerPaymentId: anotherPayment ? charge.providerPaymentId : String(payment.id),
        paidAt: charge.paidAt ?? (status === "paid" ? approvedAt : null), refundedAt: status === "refunded" ? now : charge.refundedAt,
        paymentMethod: method, metadata: { ...(charge.metadata ?? {}), summary, providerUpdatedAt: payment.date_last_updated ?? null,
          ...(status === "paid" && !anotherPayment ? { paidPaymentId: String(payment.id) } : {}), ...(needsReview ? { attention: anotherPayment ? "Pagamento adicional para a mesma venda; conferir e estornar o excedente no provedor." : "Pagamento exige conferência financeira. Não libere itens automaticamente." } : {}) }, updatedAt: now }).where(eq(paymentCharges.id, charge.id));
      await tx.update(retailSales).set({ status: saleStatus, paymentMethod: method, ...(saleStatus === "completed" ? { soldAt: approvedAt } : {}) }).where(eq(retailSales.id, sale.id));
      await tx.update(retailSalePayments).set({ status: saleStatus === "completed" ? "received" : saleStatus, method }).where(and(eq(retailSalePayments.organizationId, organizationId), eq(retailSalePayments.saleId, sale.id)));
      const ids = [...new Set([sale.financialEntryId, sale.appointmentFinancialEntryId].filter((id): id is string => Boolean(id)))];
      if (ids.length) await tx.update(financialEntries).set({ status: status === "refunded" ? "refunded" : needsReview && status !== "partially_refunded" ? "pending" : "received",
        realizedDate: status === "refunded" || (needsReview && status !== "partially_refunded") ? null : organizationDate(approvedAt, org.timezone),
        amountInCents: status === "refunded" ? charge.amountInCents : charge.amountInCents - refund, paymentMethod: method, updatedAt: now }).where(and(eq(financialEntries.organizationId, organizationId), inArray(financialEntries.id, ids)));
      const packages = await tx.select().from(clientPackages).where(and(eq(clientPackages.organizationId, organizationId), eq(clientPackages.retailSaleId, sale.id))).for("update");
      for (const assigned of packages) {
        if (saleStatus === "completed" && assigned.status === "pending_payment") {
          const duration = assigned.expiresAt ? assigned.expiresAt.getTime() - assigned.purchasedAt.getTime() : null;
          await tx.update(clientPackages).set({ status: "active", purchasedAt: approvedAt, expiresAt: duration === null ? null : new Date(approvedAt.getTime() + duration), updatedAt: now }).where(eq(clientPackages.id, assigned.id));
        } else if (saleStatus !== "completed" && assigned.status !== "cancelled") await tx.update(clientPackages).set({ status: "suspended", updatedAt: now }).where(eq(clientPackages.id, assigned.id));
      }
      if (saleStatus === "completed") await tx.update(inventoryMovements).set({ type: "sale", notes: `Venda ${sale.id.slice(0,8)} · pagamento confirmado (${provider})` }).where(and(eq(inventoryMovements.organizationId, organizationId), eq(inventoryMovements.retailSaleId, sale.id), eq(inventoryMovements.type, "sale_reservation")));
      await tx.insert(auditLogs).values({ organizationId, action: `pos_payment:${saleStatus}`, entityType: "retail_sale", entityId: sale.id, details: { chargeId, paymentId: String(payment.id), refundedInCents: refund } });
      return { duplicate: false, status: saleStatus };
    });
  }

  /** Call only after disabling the preference and checking/cancelling all pending
   * provider payments. Paid refunds never imply a physical inventory return. */
  async cancelUnpaid(organizationId: string, saleId: string, userId: string, provider = "mercado_pago") {
    return this.database.transaction(async tx => {
      const [charge] = await tx.select().from(paymentCharges).where(and(eq(paymentCharges.organizationId, organizationId), eq(paymentCharges.originId, saleId), eq(paymentCharges.originType, "retail_sale"), eq(paymentCharges.provider, provider))).for("update");
      const [sale] = await tx.select().from(retailSales).where(and(eq(retailSales.organizationId, organizationId), eq(retailSales.id, saleId))).for("update");
      if (!sale || !charge) throw new Error("Venda não encontrada.");
      if (sale.status === "cancelled") return;
      if (sale.status !== "pending_payment" || charge.status !== "pending") throw new Error("Este pagamento já foi processado; confira a venda antes de cancelar.");
      const items = await tx.select().from(retailSaleItems).where(and(eq(retailSaleItems.organizationId, organizationId), eq(retailSaleItems.saleId, saleId)));
      const quantities = new Map<string, number>();
      for (const item of items) if (item.inventoryProductId) quantities.set(item.inventoryProductId, (quantities.get(item.inventoryProductId) ?? 0) + item.quantity * 1000);
      for (const [productId, quantityMillis] of [...quantities].sort(([a],[b]) => a.localeCompare(b))) {
        const [product] = await tx.select().from(inventoryProducts).where(and(eq(inventoryProducts.organizationId, organizationId), eq(inventoryProducts.id, productId))).for("update");
        if (!product || sale.stockRestoredAt) continue;
        const restored = await restoreLots(tx, { organizationId, productId, referenceType: "sale", referenceId: saleId, userId, legacyQuantityMillis: quantityMillis });
        const balance = product.currentQuantityMillis + restored.sale;
        await tx.update(inventoryProducts).set({ currentQuantityMillis: balance, updatedAt: new Date() }).where(eq(inventoryProducts.id, productId));
        await tx.insert(inventoryMovements).values({ organizationId, productId, retailSaleId: saleId, type: "sale_reservation_release", quantityMillis: restored.sale, balanceAfterMillis: balance, createdByUserId: userId, notes: "Reserva liberada após cancelamento confirmado do checkout." });
      }
      await tx.update(clientPackages).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(clientPackages.organizationId, organizationId), eq(clientPackages.retailSaleId, saleId), eq(clientPackages.status, "pending_payment")));
      await tx.update(retailSales).set({ status: "cancelled", stockRestoredAt: new Date(), cancelledAt: new Date(), cancelledByUserId: userId, cancellationReason: "Checkout cancelado antes do pagamento" }).where(eq(retailSales.id, saleId));
      await tx.update(retailSalePayments).set({ status: "cancelled" }).where(and(eq(retailSalePayments.organizationId, organizationId), eq(retailSalePayments.saleId, saleId)));
      if (sale.financialEntryId) await tx.update(financialEntries).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(financialEntries.organizationId, organizationId), eq(financialEntries.id, sale.financialEntryId)));
      await tx.update(paymentCharges).set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() }).where(eq(paymentCharges.id, charge.id));
      await tx.update(retailQuotes).set({ saleId: null, convertedAt: null }).where(and(eq(retailQuotes.organizationId, organizationId), eq(retailQuotes.saleId, saleId)));
      await tx.insert(auditLogs).values({ organizationId, userId, action: "pos_payment:cancelled", entityType: "retail_sale", entityId: saleId });
    });
  }
}
