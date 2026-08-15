import { and, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "@/db";
import { appointments, organizations, organizationServicePlans } from "@/db/schema";
import { enqueueAppointmentNotification } from "@/lib/whatsapp-notifications";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const windowStart = new Date(now + 50 * 60_000);
  const windowEnd = new Date(now + 720 * 60 * 60_000 + 10 * 60_000);
  const candidates = await db
    .select({ id: appointments.id, startsAt: appointments.startsAt, offsets: organizations.reminderOffsetsHours })
    .from(appointments)
    .innerJoin(
      organizationServicePlans,
      eq(organizationServicePlans.organizationId, appointments.organizationId),
    )
    .innerJoin(organizations, eq(organizations.id, appointments.organizationId))
    .where(and(
      inArray(appointments.status, ["scheduled", "confirmed"]),
      gte(appointments.startsAt, windowStart),
      lte(appointments.startsAt, windowEnd),
      inArray(organizationServicePlans.whatsappServiceCode, ["notify", "menu", "chat", "chat_ai", "core_ai"]),
    ))
    .limit(100);

  let queued = 0;
  for (const candidate of candidates) {
    for (const offset of candidate.offsets.length ? candidate.offsets : [24]) {
      const target = candidate.startsAt.getTime() - offset * 60 * 60_000;
      if (Math.abs(target - now) > 10 * 60_000) continue;
      try {
        if (await enqueueAppointmentNotification(candidate.id, "reminder", `${offset}h`)) queued += 1;
      } catch (error) {
        console.error("[whatsapp-reminders] Falha ao enfileirar lembrete", candidate.id, offset, error);
      }
    }
  }

  return Response.json({ ok: true, scanned: candidates.length, queued });
}
