import { and, inArray, lt } from "drizzle-orm";

import { db } from "@/db";
import { appointments } from "@/db/schema";
import { syncAppointmentFinancialEntry } from "@/lib/finance";
import { deleteAppointmentFromGoogleCalendar } from "@/lib/google-calendar";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const expired = await db.update(appointments).set({
    status: "cancelled",
    depositStatus: "expired",
    cancellationReason: "Reserva expirada sem pagamento do sinal",
    updatedAt: new Date(),
  }).where(and(inArray(appointments.status, ["scheduled", "confirmed"]), inArray(appointments.depositStatus, ["pending", "direct_pending"]), lt(appointments.reservationExpiresAt, new Date()))).returning({ id: appointments.id });
  // A payment reported by the client (direct_review) is never expired automatically.
  await Promise.all(expired.map(async item => {
    const results = await Promise.allSettled([syncAppointmentFinancialEntry(item.id), deleteAppointmentFromGoogleCalendar(item.id)]);
    results.forEach(result => { if (result.status === "rejected") console.error("[booking-reservations] Falha ao sincronizar expiração", result.reason); });
  }));
  return Response.json({ ok: true, expired: expired.length });
}
