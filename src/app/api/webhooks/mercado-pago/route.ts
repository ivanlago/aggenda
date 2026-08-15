import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, financialEntries, organizationFinancialIntegrations, paymentChargeEvents, paymentCharges } from "@/db/schema";
import { decryptFinancialCredential } from "@/lib/financial-secret";
import { mercadoPagoRequest, type MercadoPagoCredential } from "@/lib/mercado-pago";

type MpNotification = { id?: number | string; type?: string; action?: string; data?: { id?: string } };
type MpPayment = { id: number; status: string; external_reference?: string; date_approved?: string; transaction_amount?: number; payment_method_id?: string };

function validSignature(request: Request, dataId: string, secret?: string) {
  if (!secret) return false; const signature = request.headers.get("x-signature"); const requestId = request.headers.get("x-request-id");
  const parts = Object.fromEntries((signature ?? "").split(",").map((part) => part.trim().split("="))); const ts = parts.ts; const received = parts.v1;
  if (!ts || !received || !requestId) return false; const expected = createHmac("sha256", secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex");
  const left = Buffer.from(received); const right = Buffer.from(expected); return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const organizationId = new URL(request.url).searchParams.get("organizationId"); const notification = await request.json() as MpNotification; const dataId = String(notification.data?.id ?? "");
  if (!organizationId || !dataId || (notification.type !== "payment" && !notification.action?.startsWith("payment."))) return Response.json({ received: true });
  const [integration] = await db.select().from(organizationFinancialIntegrations).where(and(eq(organizationFinancialIntegrations.organizationId, organizationId), eq(organizationFinancialIntegrations.provider, "mercado_pago"), eq(organizationFinancialIntegrations.status, "active"))).limit(1);
  if (!integration) return Response.json({ error: "Integration not found" }, { status: 404 });
  const credential = JSON.parse(decryptFinancialCredential(integration.encryptedCredential)) as MercadoPagoCredential;
  if (!validSignature(request, dataId, credential.webhookSecret)) return Response.json({ error: "Invalid signature" }, { status: 401 });
  const payment = await mercadoPagoRequest<MpPayment>(`/v1/payments/${encodeURIComponent(dataId)}`, credential.accessToken); const chargeId = payment.external_reference?.startsWith("charge:") ? payment.external_reference.slice(7) : null;
  if (!chargeId) return Response.json({ received: true }); const [charge] = await db.select().from(paymentCharges).where(and(eq(paymentCharges.id, chargeId), eq(paymentCharges.organizationId, organizationId), eq(paymentCharges.provider, "mercado_pago"))).limit(1); if (!charge) return Response.json({ received: true });
  const status = payment.status === "approved" ? "paid" : payment.status === "refunded" || payment.status === "charged_back" ? "refunded" : ["cancelled", "rejected"].includes(payment.status) ? "cancelled" : "pending";
  await db.transaction(async (tx) => { const eventId = `mp:${payment.id}:${payment.status}`; const [inserted] = await tx.insert(paymentChargeEvents).values({ organizationId, chargeId: charge.id, providerEventId: eventId, eventType: `MERCADO_PAGO_${payment.status.toUpperCase()}`, previousStatus: charge.status, status, payload: payment as unknown as Record<string, unknown> }).onConflictDoNothing().returning({ id: paymentChargeEvents.id }); if (!inserted) return; const now = new Date(); await tx.update(paymentCharges).set({ providerPaymentId: String(payment.id), status, paidAt: status === "paid" ? new Date(payment.date_approved ?? now) : charge.paidAt, cancelledAt: status === "cancelled" ? now : charge.cancelledAt, refundedAt: status === "refunded" ? now : charge.refundedAt, paymentMethod: payment.payment_method_id ?? charge.paymentMethod, updatedAt: now }).where(eq(paymentCharges.id, charge.id)); if (charge.financialEntryId && status === "paid") await tx.update(financialEntries).set({ status: "received", realizedDate: (payment.date_approved ?? now.toISOString()).slice(0, 10), paymentMethod: payment.payment_method_id ?? "mercado_pago", updatedAt: now }).where(eq(financialEntries.id, charge.financialEntryId)); await tx.insert(auditLogs).values({ organizationId, action: `status:${status}`, entityType: "payment_charge:mercado_pago", entityId: charge.id, details: { paymentId: payment.id, providerStatus: payment.status } }); });
  return Response.json({ received: true });
}
