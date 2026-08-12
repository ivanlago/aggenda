import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";

import { db } from "@/db";
import { appointments, organizationServicePlans } from "@/db/schema";
import { enqueueAppointmentNotification } from "@/lib/whatsapp-notifications";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const windowStart = new Date(now + 23 * 60 * 60_000 + 50 * 60_000);
  const windowEnd = new Date(now + 24 * 60 * 60_000 + 10 * 60_000);
  const candidates = await db
    .select({ id: appointments.id })
    .from(appointments)
    .innerJoin(
      organizationServicePlans,
      eq(organizationServicePlans.organizationId, appointments.organizationId),
    )
    .where(and(
      inArray(appointments.status, ["scheduled", "confirmed"]),
      gte(appointments.startsAt, windowStart),
      lte(appointments.startsAt, windowEnd),
      isNull(appointments.reminderClaimedAt),
      inArray(organizationServicePlans.whatsappServiceCode, ["notify", "menu", "chat", "chat_ai", "core_ai"]),
    ))
    .limit(100);

  let queued = 0;
  for (const candidate of candidates) {
    const [claimed] = await db
      .update(appointments)
      .set({ reminderClaimedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(appointments.id, candidate.id), isNull(appointments.reminderClaimedAt)))
      .returning({ id: appointments.id });
    if (!claimed) continue;
    try {
      if (await enqueueAppointmentNotification(candidate.id, "reminder")) {
        queued += 1;
      } else {
        await db.update(appointments).set({ reminderClaimedAt: null }).where(eq(appointments.id, candidate.id));
      }
    } catch (error) {
      await db.update(appointments).set({ reminderClaimedAt: null }).where(eq(appointments.id, candidate.id));
      console.error("[whatsapp-reminders] Falha ao enfileirar lembrete", candidate.id, error);
    }
  }

  return Response.json({ ok: true, scanned: candidates.length, queued });
}
