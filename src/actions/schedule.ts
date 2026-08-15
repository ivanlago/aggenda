"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  appointments,
  availabilityExceptions,
  professionals,
  services,
  weeklyAvailability,
  organizations,
} from "@/db/schema";
import { isTimeAvailable } from "@/lib/availability";
import { organizationDate, parseOrganizationDateTime, withAppointmentLock } from "@/lib/appointment-safety";
import { writeAuditLog } from "@/lib/audit";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";
import { syncAppointmentToGoogleCalendar } from "@/lib/google-calendar";
import { syncAppointmentFinancialEntry } from "@/lib/finance";
import { enqueueAppointmentNotification } from "@/lib/whatsapp-notifications";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function saveWeeklyAvailability(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "availability.manage");
  const professionalId = value(formData, "professionalId");
  const dayOfWeek = Number(value(formData, "dayOfWeek"));
  const startsAt = value(formData, "startsAt");
  const endsAt = value(formData, "endsAt");
  if (
    !professionalId ||
    !Number.isInteger(dayOfWeek) ||
    dayOfWeek < 0 ||
    dayOfWeek > 6 ||
    !/^\d{2}:\d{2}$/.test(startsAt) ||
    !/^\d{2}:\d{2}$/.test(endsAt) ||
    startsAt >= endsAt
  ) {
    throw new Error("Informe uma jornada válida.");
  }
  const [professional] = await db
    .select({ id: professionals.id })
    .from(professionals)
    .where(
      and(
        eq(professionals.id, professionalId),
        eq(professionals.organizationId, organization.id)
      )
    )
    .limit(1);
  if (!professional) throw new Error("Profissional não encontrado.");

  const [created] = await db
    .insert(weeklyAvailability)
    .values({
      organizationId: organization.id,
      professionalId,
      dayOfWeek,
      startsAt,
      endsAt,
    })
    .returning({ id: weeklyAvailability.id });
  await writeAuditLog({
    organizationId: organization.id,
    userId: session.user.id,
    action: "create",
    entityType: "weekly_availability",
    entityId: created.id,
  });
  revalidatePath("/disponibilidade");
  revalidatePath("/dashboard");
}

export async function deleteWeeklyAvailability(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "availability.manage");
  const id = value(formData, "id");
  await db
    .delete(weeklyAvailability)
    .where(
      and(
        eq(weeklyAvailability.id, id),
        eq(weeklyAvailability.organizationId, organization.id)
      )
    );
  await writeAuditLog({
    organizationId: organization.id,
    userId: session.user.id,
    action: "delete",
    entityType: "weekly_availability",
    entityId: id,
  });
  revalidatePath("/disponibilidade");
}

export async function createAvailabilityException(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "availability.manage");
  const professionalId = value(formData, "professionalId") || null;
  const startsAt = parseOrganizationDateTime(value(formData, "startsAt"), organization.timezone);
  const endsAt = parseOrganizationDateTime(value(formData, "endsAt"), organization.timezone);
  const type = value(formData, "type") === "available" ? "available" : "blocked";
  if (
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime()) ||
    startsAt >= endsAt
  ) {
    throw new Error("Informe o início e o fim do período.");
  }
  const [created] = await db
    .insert(availabilityExceptions)
    .values({
      organizationId: organization.id,
      professionalId,
      startsAt,
      endsAt,
      type,
      reason: value(formData, "reason") || null,
    })
    .returning({ id: availabilityExceptions.id });
  await writeAuditLog({
    organizationId: organization.id,
    userId: session.user.id,
    action: "create",
    entityType: "availability_exception",
    entityId: created.id,
    details: { type },
  });
  revalidatePath("/disponibilidade");
}

export async function deleteAvailabilityException(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "availability.manage");
  const id = value(formData, "id");
  await db
    .delete(availabilityExceptions)
    .where(
      and(
        eq(availabilityExceptions.id, id),
        eq(availabilityExceptions.organizationId, organization.id)
      )
    );
  await writeAuditLog({
    organizationId: organization.id,
    userId: session.user.id,
    action: "delete",
    entityType: "availability_exception",
    entityId: id,
  });
  revalidatePath("/disponibilidade");
}

export async function updateBookingSettings(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "organization.settings.manage");
  const notice = Math.max(0, Number(value(formData, "bookingNoticeHours") || 0));
  const horizon = Math.min(
    365,
    Math.max(1, Number(value(formData, "bookingHorizonDays") || 60))
  );
  const interval = Number(value(formData, "slotIntervalMinutes"));
  if (![5, 10, 15, 20, 30, 60].includes(interval)) {
    throw new Error("Intervalo de horários inválido.");
  }
  await db
    .update(organizations)
    .set({
      bookingEnabled: formData.get("bookingEnabled") === "on",
      bookingNoticeHours: notice,
      bookingHorizonDays: horizon,
      slotIntervalMinutes: interval,
      publicDescription: value(formData, "publicDescription") || null,
      publicAddress: value(formData, "publicAddress") || null,
      publicLogoUrl: value(formData, "publicLogoUrl") || null,
      publicCoverUrl: value(formData, "publicCoverUrl") || null,
      brandColor: /^#[0-9a-f]{6}$/i.test(value(formData, "brandColor")) ? value(formData, "brandColor") : "#37664f",
      customDomain: value(formData, "customDomain").toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "") || null,
      reminderOffsetsHours: [...new Set(value(formData, "reminderOffsetsHours").split(",").map(Number).filter((item) => Number.isFinite(item) && item > 0 && item <= 720))].sort((a, b) => b - a),
      reminderConfirmationEnabled: formData.get("reminderConfirmationEnabled") === "on",
      patientRecoveryDays: Math.min(730, Math.max(30, Number(value(formData, "patientRecoveryDays")) || 90)),
      cancellationPolicy: value(formData, "cancellationPolicy") || null,
      depositRefundPolicy: value(formData, "depositRefundPolicy") || null,
      latenessPolicy: value(formData, "latenessPolicy") || null,
      publicPrivacyPolicy: value(formData, "publicPrivacyPolicy") || null,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, organization.id));
  await writeAuditLog({
    organizationId: organization.id,
    userId: session.user.id,
    action: "update",
    entityType: "booking_settings",
  });
  revalidatePath("/", "layout");
}

export async function rescheduleAppointment(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "appointments.manage");
  const id = value(formData, "id");
  const startsAt = parseOrganizationDateTime(value(formData, "startsAt"), organization.timezone);
  const [item] = await db
    .select({
      serviceId: appointments.serviceId,
      professionalId: appointments.professionalId,
      duration: services.durationMinutes,
    })
    .from(appointments)
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(
      and(
        eq(appointments.id, id),
        eq(appointments.organizationId, organization.id)
      )
    )
    .limit(1);
  if (!item || Number.isNaN(startsAt.getTime()) || !item.professionalId) {
    return { error: "Agendamento ou horário inválido. Consulte novamente os horários disponíveis." };
  }
  const rescheduled = await withAppointmentLock(organization.id, item.professionalId, async (tx) => {
    const available = await isTimeAvailable({
      organizationId: organization.id, timezone: organization.timezone,
      date: organizationDate(startsAt, organization.timezone), serviceId: item.serviceId,
      professionalId: item.professionalId, slotIntervalMinutes: organization.slotIntervalMinutes,
      excludeAppointmentId: id, startsAt,
    });
    if (!available) return false;
    await tx.update(appointments).set({ startsAt,
      endsAt: new Date(startsAt.getTime() + item.duration * 60_000), status: "scheduled",
      updatedAt: new Date(),
    }).where(and(eq(appointments.id, id), eq(appointments.organizationId, organization.id)));
    return true;
  });
  if (!rescheduled) {
    return { error: "Este horário não está mais disponível. Escolha outro horário na lista." };
  }
  const followUpResults = await Promise.allSettled([
    writeAuditLog({
      organizationId: organization.id,
      userId: session.user.id,
      action: "reschedule",
      entityType: "appointment",
      entityId: id,
    }),
    syncAppointmentToGoogleCalendar(id),
    syncAppointmentFinancialEntry(id),
    enqueueAppointmentNotification(id, "reschedule"),
  ]);

  followUpResults.forEach((result, index) => {
    if (result.status === "rejected") {
      const operation = ["auditoria", "Google Agenda", "financeiro", "WhatsApp"][index];
      console.error(`[reschedule-appointment] Falha na sincronização de ${operation}`, result.reason);
    }
  });
  revalidatePath("/agendamentos");
  revalidatePath("/dashboard");
  revalidatePath("/financeiro");
}
