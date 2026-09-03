import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { appointments, organizations } from "@/db/schema";
import { getAvailableTimes } from "@/lib/availability";
import { organizationDate } from "@/lib/appointment-safety";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "Informe uma data válida." }, { status: 400 });
  }

  const [item] = await db
    .select({
      id: appointments.id,
      status: appointments.status,
      serviceId: appointments.serviceId,
      professionalId: appointments.professionalId,
      organizationId: organizations.id,
      timezone: organizations.timezone,
      noticeHours: organizations.bookingNoticeHours,
      horizonDays: organizations.bookingHorizonDays,
      slotIntervalMinutes: organizations.slotIntervalMinutes,
    })
    .from(appointments)
    .innerJoin(organizations, eq(organizations.id, appointments.organizationId))
    .where(and(eq(appointments.publicManageToken, token), eq(organizations.bookingEnabled, true)))
    .limit(1);

  if (!item) return Response.json({ error: "Agendamento não encontrado." }, { status: 404 });
  if (["cancelled", "completed", "no_show"].includes(item.status) || !item.professionalId) {
    return Response.json({ error: "Este agendamento não aceita reagendamento." }, { status: 409 });
  }

  const today = organizationDate(new Date(), item.timezone);
  const maximum = new Date(`${today}T12:00:00Z`);
  maximum.setUTCDate(maximum.getUTCDate() + item.horizonDays);
  if (date < today || date > maximum.toISOString().slice(0, 10)) {
    return Response.json({ error: "A data está fora do período permitido pela empresa." }, { status: 400 });
  }

  const availableTimes = await getAvailableTimes({
    organizationId: item.organizationId,
    timezone: item.timezone,
    date,
    serviceId: item.serviceId,
    professionalId: item.professionalId,
    slotIntervalMinutes: item.slotIntervalMinutes,
    noticeHours: item.noticeHours,
    excludeAppointmentId: item.id,
  });

  return Response.json({ availableTimes: availableTimes ?? [], timezone: item.timezone });
}
