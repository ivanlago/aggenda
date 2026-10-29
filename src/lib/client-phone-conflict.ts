import { and, eq, ne, sql } from "drizzle-orm";
import type { db } from "@/db";
import { clients } from "@/db/schema";

export async function hasClientPhoneConflict(database: typeof db, organizationId: string, phone: string | null, excludedClientId?: string) {
  if (!phone) return false;
  // Legacy/imported records may still have punctuation, a country code or an
  // eight-digit mobile number. Match the same canonical form as the form input.
  const digits = sql`regexp_replace(coalesce(${clients.phone}, ''), '[^0-9]', '', 'g')`;
  const national = sql`CASE WHEN length(${digits}) IN (12,13) AND left(${digits},2)='55' THEN substring(${digits} from 3) ELSE ${digits} END`;
  const canonical = sql`CASE WHEN length(${national})=10 AND substring(${national} from 3 for 1) IN ('6','7','8','9') THEN left(${national},2) || '9' || substring(${national} from 3) ELSE ${national} END`;
  const [conflict] = await database.select({ id: clients.id }).from(clients).where(and(eq(clients.organizationId, organizationId), sql`${canonical}=${phone}`, excludedClientId ? ne(clients.id, excludedClientId) : undefined)).limit(1);
  return Boolean(conflict);
}
