import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, financialEntries, paymentChargeEvents, paymentCharges } from "@/db/schema";
import { getPagBankCredential, pagBankRequest } from "@/lib/pagbank";

type PagBankOrder = { id?: string; reference_id?: string; charges?: Array<{ id?: string; status?: string; paid_at?: string; payment_method?: { type?: string } }> };

export async function POST(request: Request) {
  const organizationId = new URL(request.url).searchParams.get("organizationId");
  if (!organizationId) return Response.json({ error: "Organization not informed" }, { status: 400 });
  const notification = await request.json() as PagBankOrder;
  if (!notification.id) return Response.json({ received: true });
  let order: PagBankOrder;
  try { order = await pagBankRequest<PagBankOrder>(`/orders/${encodeURIComponent(notification.id)}`, await getPagBankCredential(organizationId)); }
  catch { return Response.json({ error: "Order validation failed" }, { status: 401 }); }
  const chargeId = order.reference_id?.startsWith("charge:") ? order.reference_id.slice(7) : null;
  if (!chargeId) return Response.json({ received: true });
  const [charge] = await db.select().from(paymentCharges).where(and(eq(paymentCharges.id, chargeId), eq(paymentCharges.organizationId, organizationId), eq(paymentCharges.provider, "pagbank"))).limit(1);
  if (!charge) return Response.json({ received: true });
  const providerCharge = order.charges?.[0];
  const providerStatus = providerCharge?.status ?? "WAITING";
  const status = providerStatus === "PAID" ? "paid" : ["CANCELED", "DECLINED"].includes(providerStatus) ? "cancelled" : providerStatus === "REFUNDED" ? "refunded" : "pending";
  const eventId = `pagbank:${order.id}:${providerCharge?.id ?? "order"}:${providerStatus}`;
  await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(paymentChargeEvents).values({ organizationId, chargeId, providerEventId: eventId, eventType: `PAGBANK_${providerStatus}`, previousStatus: charge.status, status, payload: order as Record<string, unknown> }).onConflictDoNothing().returning({ id: paymentChargeEvents.id });
    if (!inserted) return;
    const now = new Date();
    await tx.update(paymentCharges).set({ status, paidAt: status === "paid" ? new Date(providerCharge?.paid_at ?? now) : charge.paidAt, cancelledAt: status === "cancelled" ? now : charge.cancelledAt, refundedAt: status === "refunded" ? now : charge.refundedAt, updatedAt: now }).where(eq(paymentCharges.id, charge.id));
    if (charge.financialEntryId && status === "paid") await tx.update(financialEntries).set({ status: "received", realizedDate: (providerCharge?.paid_at ?? now.toISOString()).slice(0, 10), paymentMethod: "pix", updatedAt: now }).where(eq(financialEntries.id, charge.financialEntryId));
    await tx.insert(auditLogs).values({ organizationId, action: `status:${status}`, entityType: "payment_charge:pagbank", entityId: charge.id, details: { orderId: order.id, providerStatus } });
  });
  return Response.json({ received: true });
}
