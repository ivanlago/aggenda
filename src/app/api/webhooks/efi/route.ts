import { timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, financialEntries, paymentChargeEvents, paymentCharges } from "@/db/schema";
import { efiRequest, getEfiCredential } from "@/lib/efi";

type Notification = { pix?: Array<{ txid?: string; endToEndId?: string; horario?: string }> };
type Cob = { txid?: string; status?: string; pix?: Array<{ endToEndId?: string; horario?: string }> };
const secureEqual = (left: string, right: string) => { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); };

export async function POST(request: Request) {
  const url = new URL(request.url); const organizationId = url.searchParams.get("organizationId"); const hmac = url.searchParams.get("hmac") ?? "";
  if (!organizationId) return Response.json({ error: "Organization not informed" }, { status: 400 });
  let credential; try { credential = await getEfiCredential(organizationId); } catch { return Response.json({ error: "Integration not found" }, { status: 404 }); }
  if (!secureEqual(hmac, credential.webhookHmac)) return Response.json({ error: "Invalid signature" }, { status: 401 });
  const notification = await request.json() as Notification;
  for (const item of notification.pix ?? []) {
    if (!item.txid) continue;
    let cob: Cob; try { cob = await efiRequest<Cob>(`/v2/cob/${encodeURIComponent(item.txid)}`, credential); } catch { continue; }
    const [charge] = await db.select().from(paymentCharges).where(and(eq(paymentCharges.organizationId, organizationId), eq(paymentCharges.provider, "efi"), eq(paymentCharges.providerPaymentId, item.txid))).limit(1); if (!charge) continue;
    const status = cob.status === "CONCLUIDA" ? "paid" : cob.status === "REMOVIDA_PELO_USUARIO_RECEBEDOR" || cob.status === "REMOVIDA_PELO_PSP" ? "cancelled" : "pending";
    const providerPix = cob.pix?.[0]; const eventId = `efi:${item.txid}:${providerPix?.endToEndId ?? item.endToEndId ?? cob.status}`;
    await db.transaction(async (tx) => { const [inserted] = await tx.insert(paymentChargeEvents).values({ organizationId, chargeId: charge.id, providerEventId: eventId, eventType: `EFI_${cob.status ?? "UPDATED"}`, previousStatus: charge.status, status, payload: cob as Record<string, unknown> }).onConflictDoNothing().returning({ id: paymentChargeEvents.id }); if (!inserted) return; const now = new Date(); await tx.update(paymentCharges).set({ status, paidAt: status === "paid" ? new Date(providerPix?.horario ?? item.horario ?? now) : charge.paidAt, cancelledAt: status === "cancelled" ? now : charge.cancelledAt, updatedAt: now }).where(eq(paymentCharges.id, charge.id)); if (charge.financialEntryId && status === "paid") await tx.update(financialEntries).set({ status: "received", realizedDate: (providerPix?.horario ?? item.horario ?? now.toISOString()).slice(0, 10), paymentMethod: "pix", updatedAt: now }).where(eq(financialEntries.id, charge.financialEntryId)); await tx.insert(auditLogs).values({ organizationId, action: `status:${status}`, entityType: "payment_charge:efi", entityId: charge.id, details: { txid: item.txid, providerStatus: cob.status } }); });
  }
  return Response.json({ received: true });
}
