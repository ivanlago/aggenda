import { sql } from "drizzle-orm";

import { db } from "@/db";
export { parseOrganizationDateTime, organizationDate, formatOrganizationDateTime, organizationDayRange } from "@/lib/organization-time";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class AppointmentConflictError extends Error {
  constructor(message = "O horário selecionado não está mais disponível.") {
    super(message);
    this.name = "AppointmentConflictError";
  }
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
