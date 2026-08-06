import { sql } from "drizzle-orm";

import { db } from "@/db";
import { zonedDate } from "@/lib/availability";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class AppointmentConflictError extends Error {
  constructor(message = "O horário selecionado não está mais disponível.") {
    super(message);
    this.name = "AppointmentConflictError";
  }
}

export function parseOrganizationDateTime(value: string, timezone: string) {
  const local = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/.exec(value);
  return local ? zonedDate(local[1], local[2], timezone) : new Date(value);
}

export function organizationDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(date);
}

export function formatOrganizationDateTime(
  date: Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions = {}
) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
    timeZone: timezone,
  }).format(date);
}

export function organizationDayRange(date: Date, timezone: string) {
  const localDate = organizationDate(date, timezone);
  const [year, month, day] = localDate.split("-").map(Number);
  const nextLocalDate = new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);
  return {
    start: zonedDate(localDate, "00:00", timezone),
    end: zonedDate(nextLocalDate, "00:00", timezone),
  };
}

export async function withAppointmentLock<T>(
  organizationId: string,
  professionalId: string | null | undefined,
  callback: (tx: Transaction) => Promise<T>
) {
  return db.transaction(async (tx) => {
    const key = `${organizationId}:${professionalId ?? "without-professional"}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
    return callback(tx);
  });
}
