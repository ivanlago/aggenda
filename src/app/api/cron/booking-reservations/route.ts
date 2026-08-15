import { and, eq, lt } from "drizzle-orm";

import { db } from "@/db";
import { appointments } from "@/db/schema";

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
  }).where(and(eq(appointments.depositStatus, "pending"), lt(appointments.reservationExpiresAt, new Date()))).returning({ id: appointments.id });
  return Response.json({ ok: true, expired: expired.length });
}
