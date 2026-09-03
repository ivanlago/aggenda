import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { appointments, clients, organizations, services } from "@/db/schema";
import { enqueueAppointmentNotification } from "@/lib/whatsapp-notifications";
import { syncAppointmentFinancialEntry } from "@/lib/finance";
import { deleteAppointmentFromGoogleCalendar, syncAppointmentToGoogleCalendar } from "@/lib/google-calendar";
import { isTimeAvailable } from "@/lib/availability";
import { organizationDate, withAppointmentLock } from "@/lib/appointment-safety";
import { writeAuditLog } from "@/lib/audit";
import { sendAppointmentManagementEmail } from "@/lib/email";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await request.json() as { action?: string; startsAt?: string; reason?: string };
  if (!["confirm", "cancel", "reschedule"].includes(body.action ?? "")) return Response.json({ error: "Ação inválida." }, { status: 400 });
  const [item] = await db.select({
    id: appointments.id, organizationId: appointments.organizationId, clientId: appointments.clientId,
    serviceId: appointments.serviceId, professionalId: appointments.professionalId, startsAt: appointments.startsAt,
    status: appointments.status, confirmedAt: appointments.confirmedAt, duration: services.durationMinutes,
    timezone: organizations.timezone, noticeHours: organizations.bookingNoticeHours,
    horizonDays: organizations.bookingHorizonDays, slotIntervalMinutes: organizations.slotIntervalMinutes,
    clientName: clients.name, clientEmail: clients.email, organizationName: organizations.name,
    serviceName: services.name, manageToken: appointments.publicManageToken,
  }).from(appointments)
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(organizations, eq(organizations.id, appointments.organizationId))
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .where(eq(appointments.publicManageToken, token)).limit(1);
  if (!item) return Response.json({ error: "Agendamento não encontrado." }, { status: 404 });
  if (["cancelled", "completed", "no_show"].includes(item.status)) return Response.json({ error: "Este agendamento não aceita mais alterações." }, { status: 409 });

  if (body.action === "reschedule") {
    const startsAt = new Date(body.startsAt ?? "");
    if (Number.isNaN(startsAt.getTime()) || !item.professionalId) {
      return Response.json({ error: "Selecione um horário válido." }, { status: 400 });
    }
    const targetDate = organizationDate(startsAt, item.timezone);
    const today = organizationDate(new Date(), item.timezone);
    const maximum = new Date(`${today}T12:00:00Z`);
    maximum.setUTCDate(maximum.getUTCDate() + item.horizonDays);
    if (targetDate < today || targetDate > maximum.toISOString().slice(0, 10)) {
      return Response.json({ error: "A data está fora do período permitido pela empresa." }, { status: 400 });
    }
    const updatedAt = new Date();
    const rescheduled = await withAppointmentLock(item.organizationId, item.professionalId, async (tx) => {
      const available = await isTimeAvailable({
        organizationId: item.organizationId, timezone: item.timezone, date: targetDate,
        serviceId: item.serviceId, professionalId: item.professionalId,
        slotIntervalMinutes: item.slotIntervalMinutes, noticeHours: item.noticeHours,
        excludeAppointmentId: item.id, startsAt,
      });
      if (!available) return false;
      await tx.update(appointments).set({
        startsAt,
        endsAt: new Date(startsAt.getTime() + item.duration * 60_000),
        status: "scheduled",
        confirmedAt: null,
        updatedAt,
      }).where(and(eq(appointments.id, item.id), eq(appointments.organizationId, item.organizationId)));
      return true;
    });
    if (!rescheduled) return Response.json({ error: "Este horário não está mais disponível. Escolha outro." }, { status: 409 });

    const followUps: Promise<unknown>[] = [
      writeAuditLog({ organizationId: item.organizationId, action: "reschedule", entityType: "appointment", entityId: item.id, details: { from: item.startsAt.toISOString(), to: startsAt.toISOString(), source: "public_self_service" } }),
      syncAppointmentToGoogleCalendar(item.id),
      syncAppointmentFinancialEntry(item.id),
      enqueueAppointmentNotification(item.id, "reschedule"),
    ];
    if (item.clientEmail && item.manageToken) {
      followUps.push(sendAppointmentManagementEmail({
        email: item.clientEmail, clientName: item.clientName, organizationName: item.organizationName,
        serviceName: item.serviceName,
        scheduledFor: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: item.timezone }).format(startsAt),
        manageUrl: new URL(`/agendamento/${item.manageToken}`, request.url).toString(),
        appointmentId: item.id, version: `rescheduled-${updatedAt.getTime()}`,
      }));
    }
    const results = await Promise.allSettled(followUps);
    results.forEach((result) => { if (result.status === "rejected") console.error("[public-appointment] Falha após reagendamento", result.reason); });
    return Response.json({ status: "scheduled", startsAt: startsAt.toISOString() });
  }

  const status = body.action === "confirm" ? "confirmed" : "cancelled";
  const cancellationReason = status === "cancelled" ? (body.reason?.trim() || "Cancelado pelo cliente pela página de autoatendimento") : null;
  await db.update(appointments).set({ status, confirmedAt: status === "confirmed" ? new Date() : item.confirmedAt, cancellationReason, updatedAt: new Date() }).where(and(eq(appointments.id, item.id), eq(appointments.organizationId, item.organizationId)));
  const followUps = [
    syncAppointmentFinancialEntry(item.id),
    status === "cancelled" ? deleteAppointmentFromGoogleCalendar(item.id) : Promise.resolve(),
    enqueueAppointmentNotification(item.id, status === "confirmed" ? "confirmation" : "cancellation"),
    writeAuditLog({ organizationId: item.organizationId, action: `status:${status}`, entityType: "appointment", entityId: item.id, details: { previousStatus: item.status, status, cancellationReason, source: "public_self_service" } }),
  ];
  const results = await Promise.allSettled(followUps);
  results.forEach((result) => { if (result.status === "rejected") console.error("[public-appointment] Falha após mudança de status", result.reason); });
  return Response.json({ status });
}
