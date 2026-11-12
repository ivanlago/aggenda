import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments, auditLogs, financialEntries, paymentCharges, paymentChargeEvents } from "@/db/schema";
import { enqueueAppointmentNotification } from "./whatsapp-notifications";
import { syncAppointmentToGoogleCalendar } from "./google-calendar";

type Charge = typeof paymentCharges.$inferSelect;
/** Call only after authenticating and retrieving the payment from its provider. */
export async function confirmBookingPayment(charge: Charge, input: {
  eventId: string; status: string; amountInCents: number; paymentId: string; method?: string; paidAt?: string;
}) {
  if (input.amountInCents !== charge.amountInCents) throw new Error("BOOKING_PAYMENT_AMOUNT_MISMATCH");
  const confirmed = await db.transaction(async tx => {
    const [current] = await tx.select().from(paymentCharges).where(and(eq(paymentCharges.id, charge.id), eq(paymentCharges.organizationId, charge.organizationId))).for("update");
    if (!current || current.originType !== "appointment") return false;
    if (current.status === "paid" && input.status === "paid") return false;
    // Delayed pending/rejection events must not erase a confirmed receipt.
    if (["paid", "refunded"].includes(current.status) && !["paid", "refunded"].includes(input.status)) return false;
    if (current.status === "refunded") return false;
    const [event] = await tx.insert(paymentChargeEvents).values({ organizationId: current.organizationId, chargeId: current.id, providerEventId: input.eventId, eventType: "BOOKING_PAYMENT_UPDATED", status: input.status, previousStatus: current.status }).onConflictDoNothing().returning({ id: paymentChargeEvents.id });
    if (!event) return false;
    const [appointment] = await tx.select().from(appointments).where(and(eq(appointments.id, current.originId), eq(appointments.organizationId, current.organizationId))).for("update");
    if (!appointment) throw new Error("BOOKING_PAYMENT_APPOINTMENT_MISSING");
    const now = new Date();
    const paidAt = input.paidAt && !Number.isNaN(Date.parse(input.paidAt)) ? new Date(input.paidAt) : now;
    const active = ["scheduled", "confirmed"].includes(appointment.status) && (!appointment.reservationExpiresAt || appointment.reservationExpiresAt > now);
    await tx.update(paymentCharges).set({ status: input.status, providerPaymentId: input.paymentId, paymentMethod: input.method || current.paymentMethod, paidAt: input.status === "paid" ? paidAt : current.paidAt, refundedAt: input.status === "refunded" ? now : current.refundedAt, updatedAt: now }).where(eq(paymentCharges.id, current.id));
    if (current.financialEntryId && input.status === "paid") await tx.update(financialEntries).set({ status: "received", realizedDate: paidAt.toISOString().slice(0, 10), paymentMethod: input.method || current.paymentMethod, updatedAt: now }).where(and(eq(financialEntries.id, current.financialEntryId), eq(financialEntries.organizationId, current.organizationId)));
    if (current.financialEntryId && input.status === "refunded") await tx.update(financialEntries).set({ status: "pending", realizedDate: null, updatedAt: now }).where(and(eq(financialEntries.id, current.financialEntryId), eq(financialEntries.organizationId, current.organizationId)));
    if (input.status === "paid") await tx.update(appointments).set({ depositStatus: "paid", ...(active ? { status: "confirmed", confirmedAt: now, reservationExpiresAt: null } : { ...(["scheduled", "confirmed"].includes(appointment.status) ? { status: "cancelled" } : {}), metadata: { ...appointment.metadata, depositNeedsReview: true } }), updatedAt: now }).where(eq(appointments.id, appointment.id));
    if (input.status === "refunded") await tx.update(appointments).set({ depositStatus: "refunded", updatedAt: now }).where(eq(appointments.id, appointment.id));
    await tx.insert(auditLogs).values({ organizationId: current.organizationId, action: `deposit:${input.status}`, entityType: "appointment", entityId: appointment.id, details: { chargeId: current.id, provider: current.provider, needsReview: input.status === "paid" && !active } });
    return input.status === "paid" && current.status !== "paid" && active;
  });
  if (confirmed) {
    await syncAppointmentToGoogleCalendar(charge.originId);
    await enqueueAppointmentNotification(charge.originId, "confirmation");
  }
}
