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
import { writeAuditLog } from "@/lib/audit";
import { requireOrganization } from "@/lib/session";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function assertManager(role: string) {
  if (!["owner", "admin"].includes(role)) {
    throw new Error("Você não tem permissão para esta alteração.");
  }
}

export async function saveWeeklyAvailability(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertManager(organization.role);
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
  assertManager(organization.role);
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
  assertManager(organization.role);
  const professionalId = value(formData, "professionalId") || null;
  const startsAt = new Date(value(formData, "startsAt"));
  const endsAt = new Date(value(formData, "endsAt"));
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
  assertManager(organization.role);
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
  assertManager(organization.role);
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
  const id = value(formData, "id");
  const startsAt = new Date(value(formData, "startsAt"));
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
    throw new Error("Agendamento ou horário inválido.");
  }
  const available = await isTimeAvailable({
    organizationId: organization.id,
    timezone: organization.timezone,
    date: new Intl.DateTimeFormat("en-CA", {
      timeZone: organization.timezone,
    }).format(startsAt),
    serviceId: item.serviceId,
    professionalId: item.professionalId,
    slotIntervalMinutes: organization.slotIntervalMinutes,
    excludeAppointmentId: id,
    startsAt,
  });
  if (!available) throw new Error("O horário não está mais disponível.");
  await db
    .update(appointments)
    .set({
      startsAt,
      endsAt: new Date(startsAt.getTime() + item.duration * 60_000),
      status: "scheduled",
      updatedAt: new Date(),
    })
    .where(eq(appointments.id, id));
  await writeAuditLog({
    organizationId: organization.id,
    userId: session.user.id,
    action: "reschedule",
    entityType: "appointment",
    entityId: id,
  });
  revalidatePath("/agendamentos");
  revalidatePath("/dashboard");
}
