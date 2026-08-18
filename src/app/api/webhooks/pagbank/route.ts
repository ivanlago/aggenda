import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, financialEntries, paymentChargeEvents, paymentCharges } from "@/db/schema";
import { getPagBankCredential, pagBankRequest } from "@/lib/pagbank";

type PagBankCharge = { id?: string; status?: string; paid_at?: string; payment_method?: { type?: string } };
type PagBankResource = { id?: string; reference_id?: string; status?: string; charges?: PagBankCharge[]; payments?: Array<{ id?: string; reference_id?: string; charges?: PagBankCharge[] }> };

const mapStatus = (status: string) => status === "PAID" ? "paid" : ["CANCELED", "CANCELLED", "DECLINED", "INACTIVE", "EXPIRED"].includes(status) ? "cancelled" : status === "REFUNDED" ? "refunded" : "pending";
const mapMethod = (type?: string) => type === "BOLETO" ? "boleto" : type === "CREDIT_CARD" || type === "DEBIT_CARD" ? "credit_card" : type === "PIX" ? "pix" : undefined;

export async function POST(request: Request) {
  const organizationId = new URL(request.url).searchParams.get("organizationId");
  if (!organizationId) return Response.json({ error: "Organization not informed" }, { status: 400 });
  const notification = await request.json() as PagBankResource;
  if (!notification.id) return Response.json({ received: true });
  const resourcePath = notification.id.startsWith("CHEC_") ? `/checkouts/${encodeURIComponent(notification.id)}` : notification.id.startsWith("ORDE_") ? `/orders/${encodeURIComponent(notification.id)}` : null;
  if (!resourcePath) return Response.json({ received: true });
  let resource: PagBankResource;
  try { resource = await pagBankRequest<PagBankResource>(resourcePath, await getPagBankCredential(organizationId)); }
  catch { return Response.json({ error: "PagBank resource validation failed" }, { status: 401 }); }
  const reference = resource.reference_id ?? resource.payments?.find((item) => item.reference_id)?.reference_id;
  const chargeId = reference?.startsWith("charge:") ? reference.slice(7) : null;
  if (!chargeId) return Response.json({ received: true });
  const [charge] = await db.select().from(paymentCharges).where(and(eq(paymentCharges.id, chargeId), eq(paymentCharges.organizationId, organizationId), eq(paymentCharges.provider, "pagbank"))).limit(1);
  if (!charge) return Response.json({ received: true });
  const providerCharge = resource.charges?.[0] ?? resource.payments?.flatMap((item) => item.charges ?? [])[0];
  const providerStatus = providerCharge?.status ?? resource.status ?? "WAITING";
  const mappedStatus = mapStatus(providerStatus);
  const status = !providerCharge && ["paid", "refunded"].includes(charge.status) ? charge.status : mappedStatus;
  const eventId = `pagbank:${resource.id}:${providerCharge?.id ?? "resource"}:${providerStatus}`;
  await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(paymentChargeEvents).values({ organizationId, chargeId, providerEventId: eventId, eventType: `PAGBANK_${providerStatus}`, previousStatus: charge.status, status, payload: resource as Record<string, unknown> }).onConflictDoNothing().returning({ id: paymentChargeEvents.id });
    if (!inserted) return;
    const now = new Date();
    const paymentMethod = mapMethod(providerCharge?.payment_method?.type) ?? charge.paymentMethod;
    await tx.update(paymentCharges).set({ providerPaymentId: providerCharge?.id ?? charge.providerPaymentId, paymentMethod, status, paidAt: status === "paid" ? new Date(providerCharge?.paid_at ?? now) : charge.paidAt, cancelledAt: status === "cancelled" ? now : charge.cancelledAt, refundedAt: status === "refunded" ? now : charge.refundedAt, updatedAt: now }).where(eq(paymentCharges.id, charge.id));
    if (charge.financialEntryId && status === "paid") await tx.update(financialEntries).set({ status: "received", realizedDate: (providerCharge?.paid_at ?? now.toISOString()).slice(0, 10), paymentMethod: paymentMethod ?? "pagbank", updatedAt: now }).where(eq(financialEntries.id, charge.financialEntryId));
    if (charge.financialEntryId && status === "refunded") await tx.update(financialEntries).set({ status: "pending", realizedDate: null, updatedAt: now }).where(eq(financialEntries.id, charge.financialEntryId));
    await tx.insert(auditLogs).values({ organizationId, action: `status:${status}`, entityType: "payment_charge:pagbank", entityId: charge.id, details: { resourceId: resource.id, providerChargeId: providerCharge?.id, providerStatus } });
  });
  return Response.json({ received: true });
}
