import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { organizations, professionals } from "@/db/schema";
import { getAvailableTimes } from "@/lib/availability";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const date = request.nextUrl.searchParams.get("date");
  const serviceId = request.nextUrl.searchParams.get("serviceId");
  const professionalId = request.nextUrl.searchParams.get("professionalId");
  if (!date || !serviceId || !professionalId) {
    return Response.json({ error: "Parâmetros incompletos." }, { status: 400 });
  }
  const [organization] = await db
    .select()
    .from(organizations)
    .where(
      and(eq(organizations.slug, slug), eq(organizations.bookingEnabled, true))
    )
    .limit(1);
  if (!organization) {
    return Response.json({ error: "Agenda indisponível." }, { status: 404 });
  }
  const selected = new Date(`${date}T12:00:00Z`);
  const lastDay = new Date();
  lastDay.setDate(lastDay.getDate() + organization.bookingHorizonDays);
  if (Number.isNaN(selected.getTime()) || selected > lastDay) {
    return Response.json({ error: "Data fora da janela de agendamento." }, { status: 400 });
  }
  const [professional] = await db
    .select({ id: professionals.id })
    .from(professionals)
    .where(
      and(
        eq(professionals.id, professionalId),
        eq(professionals.organizationId, organization.id),
        eq(professionals.isActive, true),
        eq(professionals.isBookable, true)
      )
    )
    .limit(1);
  if (!professional) {
    return Response.json({ error: "Profissional indisponível." }, { status: 404 });
  }
  const times = await getAvailableTimes({
    organizationId: organization.id,
    timezone: organization.timezone,
    date,
    serviceId,
    professionalId,
    slotIntervalMinutes: organization.slotIntervalMinutes,
    noticeHours: organization.bookingNoticeHours,
  });
  if (times === null) {
    return Response.json({ error: "Serviço não encontrado." }, { status: 404 });
  }
  return Response.json({ availableTimes: times, timezone: organization.timezone });
}
