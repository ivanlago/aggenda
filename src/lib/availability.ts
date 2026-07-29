import { and, eq, gte, inArray, isNull, lt, ne, or } from "drizzle-orm";

import { db } from "@/db";
import {
  appointments,
  availabilityExceptions,
  services,
  servicesToProfessionals,
  weeklyAvailability,
} from "@/db/schema";

type AvailabilityInput = {
  organizationId: string;
  timezone: string;
  date: string;
  serviceId: string;
  professionalId?: string | null;
  slotIntervalMinutes?: number;
  noticeHours?: number;
  excludeAppointmentId?: string;
};

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function zonedDate(date: string, time: string, timezone: string) {
  const desired = new Date(`${date}T${time}:00Z`);
  let result = new Date(desired);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = zonedParts(result, timezone);
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute)
    );
    result = new Date(result.getTime() + desired.getTime() - represented);
  }
  return result;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export async function getAvailableTimes(input: AvailabilityInput) {
  const [service] = await db
    .select({ duration: services.durationMinutes })
    .from(services)
    .where(
      and(
        eq(services.id, input.serviceId),
        eq(services.organizationId, input.organizationId),
        eq(services.isActive, true)
      )
    )
    .limit(1);
  if (!service) return null;

  if (input.professionalId) {
    const links = await db
      .select({ id: servicesToProfessionals.professionalId })
      .from(servicesToProfessionals)
      .where(
        and(
          eq(servicesToProfessionals.organizationId, input.organizationId),
          eq(servicesToProfessionals.serviceId, input.serviceId)
        )
      );
    if (links.length && !links.some((item) => item.id === input.professionalId)) {
      return [];
    }
  }

  const dayStart = zonedDate(input.date, "00:00", input.timezone);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);
  const dayOfWeek = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: input.timezone,
      weekday: "short",
    })
      .format(dayStart)
      .replace(
        /Sun|Mon|Tue|Wed|Thu|Fri|Sat/,
        (value) => String(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value))
      )
  );

  const professionalCondition = input.professionalId
    ? or(
        eq(weeklyAvailability.professionalId, input.professionalId),
        isNull(weeklyAvailability.professionalId)
      )
    : undefined;
  const ranges = await db
    .select()
    .from(weeklyAvailability)
    .where(
      and(
        eq(weeklyAvailability.organizationId, input.organizationId),
        eq(weeklyAvailability.dayOfWeek, dayOfWeek),
        professionalCondition
      )
    );

  const appointmentConditions = [
    eq(appointments.organizationId, input.organizationId),
    gte(appointments.startsAt, dayStart),
    lt(appointments.startsAt, dayEnd),
    inArray(appointments.status, ["scheduled", "confirmed"]),
  ];
  if (input.professionalId) {
    appointmentConditions.push(eq(appointments.professionalId, input.professionalId));
  }
  if (input.excludeAppointmentId) {
    appointmentConditions.push(ne(appointments.id, input.excludeAppointmentId));
  }

  const exceptionConditions = [
    eq(availabilityExceptions.organizationId, input.organizationId),
    lt(availabilityExceptions.startsAt, dayEnd),
    gte(availabilityExceptions.endsAt, dayStart),
  ];
  if (input.professionalId) {
    exceptionConditions.push(
      or(
        eq(availabilityExceptions.professionalId, input.professionalId),
        isNull(availabilityExceptions.professionalId)
      )!
    );
  }

  const [busy, exceptions] = await Promise.all([
    db
      .select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt })
      .from(appointments)
      .where(and(...appointmentConditions)),
    db.select().from(availabilityExceptions).where(and(...exceptionConditions)),
  ]);

  const effectiveRanges = [
    ...ranges.map((range) => ({ start: range.startsAt, end: range.endsAt })),
    ...exceptions
      .filter((item) => item.type === "available")
      .map((item) => ({
        start: zonedParts(item.startsAt, input.timezone).hour + ":" + zonedParts(item.startsAt, input.timezone).minute,
        end: zonedParts(item.endsAt, input.timezone).hour + ":" + zonedParts(item.endsAt, input.timezone).minute,
      })),
  ];
  const blocked = exceptions.filter((item) => item.type === "blocked");
  const minimum = new Date(Date.now() + (input.noticeHours ?? 0) * 60 * 60_000);
  const interval = input.slotIntervalMinutes ?? 30;
  const slots: string[] = [];

  for (const range of effectiveRanges) {
    for (
      let minutes = timeToMinutes(range.start);
      minutes + service.duration <= timeToMinutes(range.end);
      minutes += interval
    ) {
      const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
        minutes % 60
      ).padStart(2, "0")}`;
      const start = zonedDate(input.date, time, input.timezone);
      const end = new Date(start.getTime() + service.duration * 60_000);
      if (start < minimum) continue;
      if (busy.some((item) => start < item.endsAt && end > item.startsAt)) continue;
      if (blocked.some((item) => start < item.endsAt && end > item.startsAt)) continue;
      slots.push(start.toISOString());
    }
  }

  return [...new Set(slots)].sort();
}

export async function isTimeAvailable(
  input: AvailabilityInput & { startsAt: Date }
) {
  const times = await getAvailableTimes(input);
  return times?.includes(input.startsAt.toISOString()) ?? false;
}
