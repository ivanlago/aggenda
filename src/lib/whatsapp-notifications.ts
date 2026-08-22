import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  appointments,
  clients,
  organizationServicePlans,
  organizations,
  outboxEvents,
  professionals,
  services,
  whatsappChannels,
} from "@/db/schema";
import { formatOrganizationDateTime } from "@/lib/appointment-safety";
import { isWhatsAppServiceCode, whatsappServices } from "@/lib/service-plans";
import { triggerOutboxWorker } from "@/lib/outbox-trigger";

export type AppointmentNotificationKind = "confirmation" | "reschedule" | "cancellation" | "reminder";

function normalizedPhone(value: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (!digits) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export async function enqueueAppointmentNotification(
  appointmentId: string,
  kind: AppointmentNotificationKind,
  occurrence = "once",
) {
  const [item] = await db
    .select({
      organizationId: appointments.organizationId,
      startsAt: appointments.startsAt,
      updatedAt: appointments.updatedAt,
      cancellationReason: appointments.cancellationReason,
      clientName: clients.name,
      clientPhone: clients.phone,
      serviceName: services.name,
      professionalName: professionals.name,
      timezone: organizations.timezone,
      channelId: whatsappChannels.id,
      phoneNumberId: whatsappChannels.phoneNumberId,
      whatsappServiceCode: organizationServicePlans.whatsappServiceCode,
    })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(organizations, eq(organizations.id, appointments.organizationId))
    .leftJoin(professionals, eq(professionals.id, appointments.professionalId))
    .leftJoin(organizationServicePlans, eq(organizationServicePlans.organizationId, appointments.organizationId))
    .leftJoin(
      whatsappChannels,
      and(
        eq(whatsappChannels.organizationId, appointments.organizationId),
        eq(whatsappChannels.isActive, true),
      ),
    )
    .where(eq(appointments.id, appointmentId))
    .limit(1);

  const serviceCode = item?.whatsappServiceCode && isWhatsAppServiceCode(item.whatsappServiceCode)
    ? item.whatsappServiceCode
    : "core_ai";
  const to = normalizedPhone(item?.clientPhone ?? null);
  if (!item?.channelId || !item.phoneNumberId || !to || !whatsappServices[serviceCode].usesCloudApi) {
    return false;
  }

  const scheduledFor = formatOrganizationDateTime(item.startsAt, item.timezone);
  const reason = item.cancellationReason || "Cancelamento solicitado";
  const professional = item.professionalName || "Profissional a definir";
  const preview = kind === "cancellation"
    ? `Olá, ${item.clientName}! Seu agendamento de ${item.serviceName}, previsto para ${scheduledFor}, foi cancelado. Motivo: ${reason}.`
    : kind === "reminder"
      ? `Olá, ${item.clientName}! Lembrete: seu agendamento de ${item.serviceName} será em ${scheduledFor}. Profissional: ${professional}.`
      : `Olá, ${item.clientName}! Seu agendamento de ${item.serviceName} foi ${kind === "reschedule" ? "reagendado" : "confirmado"} para ${scheduledFor}. Profissional: ${professional}.`;

  await db.insert(outboxEvents).values({
    organizationId: item.organizationId,
    eventKey: `whatsapp:${kind}:${appointmentId}:${kind === "reminder" ? occurrence : item.updatedAt.getTime()}`,
    eventType: "whatsapp.template.send",
    aggregateType: "appointment",
    aggregateId: appointmentId,
    payload: {
      organizationId: item.organizationId,
      channelId: item.channelId,
      phoneNumberId: item.phoneNumberId,
      to,
      notificationKind: kind,
      appointmentId,
      languageCode: "pt_BR",
      parameters: kind === "cancellation"
        ? [item.clientName, item.serviceName, scheduledFor, reason]
        : [item.clientName, item.serviceName, scheduledFor, professional],
      preview,
    },
  }).onConflictDoNothing({ target: outboxEvents.eventKey });

  await triggerOutboxWorker();
  return true;
}
