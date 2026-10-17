import { and, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { db } from "@/db";
import { appointments } from "@/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const activePublicAppointment = (now = new Date()) => and(
  inArray(appointments.status, ["scheduled", "confirmed"]),
  or(ne(appointments.depositStatus, "pending"), isNull(appointments.reservationExpiresAt), gt(appointments.reservationExpiresAt, now)),
);

export class PublicBookingConflict extends Error {
  constructor(public code: "CLIENT_APPOINTMENT_CONFLICT" | "SERVICE_REPEAT_CONFIRMATION" | "SERVICE_REPEAT_BLOCKED", public existing: Array<{ id: string; startsAt: Date; publicManageToken: string | null }>) { super(code); }
}

export async function lockBookingPatient(tx: Transaction, organizationId: string, clientId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`patient:${organizationId}:${clientId}`}, 0))`);
}

// Caller holds the patient lock until its insert/update commits.
export async function inspectPublicBooking(tx: Transaction, input: {
  organizationId: string; clientId: string; serviceId: string; professionalId: string;
  startsAt: Date; endsAt: Date; repeatPolicy: string; acknowledgedIds: string[]; excludeId?: string;
}) {
  const scope = and(eq(appointments.organizationId, input.organizationId), eq(appointments.clientId, input.clientId), activePublicAppointment(), input.excludeId ? ne(appointments.id, input.excludeId) : undefined);
  const [exact] = input.excludeId ? [] : await tx.select().from(appointments).where(and(scope, eq(appointments.serviceId, input.serviceId), eq(appointments.professionalId, input.professionalId), eq(appointments.startsAt, input.startsAt))).limit(1);
  if (exact) return exact;
  const overlaps = await tx.select({ id: appointments.id, startsAt: appointments.startsAt, publicManageToken: appointments.publicManageToken }).from(appointments)
    .where(and(scope, lt(appointments.startsAt, input.endsAt), gt(appointments.endsAt, input.startsAt))).limit(1);
  if (overlaps.length) throw new PublicBookingConflict("CLIENT_APPOINTMENT_CONFLICT", overlaps);
  if (!input.excludeId) {
    const repeats = await tx.select({ id: appointments.id, startsAt: appointments.startsAt, publicManageToken: appointments.publicManageToken }).from(appointments)
      .where(and(scope, eq(appointments.serviceId, input.serviceId), gt(appointments.startsAt, new Date())));
    if (repeats.length && input.repeatPolicy === "block") throw new PublicBookingConflict("SERVICE_REPEAT_BLOCKED", repeats);
    if (repeats.some(item => !input.acknowledgedIds.includes(item.id))) throw new PublicBookingConflict("SERVICE_REPEAT_CONFIRMATION", repeats);
  }
  return undefined;
}
