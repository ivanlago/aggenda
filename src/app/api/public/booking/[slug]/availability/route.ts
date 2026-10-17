import { portalRequestClient } from "@/lib/portal-request";
import { activePublicAppointment } from "@/lib/public-booking-guard";
import { organizationDate, zonedDate } from "@/lib/organization-time";
import { and, eq, gt, lt } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { appointments, organizations, professionals, services } from "@/db/schema";
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
  const today = organizationDate(new Date(), organization.timezone);
  const lastDay = new Date(`${today}T12:00:00Z`);
  lastDay.setUTCDate(lastDay.getUTCDate() + organization.bookingHorizonDays);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(selected.getTime()) || selected.toISOString().slice(0, 10) !== date || date < today || date > lastDay.toISOString().slice(0, 10)) {
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
  const patientId = request.nextUrl.searchParams.get("patientId") || undefined;
  const patient = await portalRequestClient(request, organization.id, patientId);
  if (patientId && !patient) return Response.json({ error: "Identifique-se para consultar os horários deste paciente." }, { status: 401 });
  let availableTimes = times;
  if (patient && times.length) {
    const [service] = await db.select({ duration: services.durationMinutes }).from(services).where(and(eq(services.id, serviceId), eq(services.organizationId, organization.id))).limit(1);
    const end = new Date(`${date}T12:00:00Z`); end.setUTCDate(end.getUTCDate() + 1);
    const reserved = await db.select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt }).from(appointments)
      .where(and(eq(appointments.organizationId, organization.id), eq(appointments.clientId, patient.id), activePublicAppointment(), lt(appointments.startsAt, zonedDate(end.toISOString().slice(0, 10), "00:00", organization.timezone)), gt(appointments.endsAt, zonedDate(date, "00:00", organization.timezone))));
    availableTimes = times.filter(time => !reserved.some(item => new Date(time) < item.endsAt && new Date(new Date(time).getTime() + (service?.duration || 0) * 60_000) > item.startsAt));
  }
  return Response.json({ availableTimes, timezone: organization.timezone }, { headers: { "Cache-Control": "no-store" } });
}
