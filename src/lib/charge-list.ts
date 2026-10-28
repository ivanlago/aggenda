import { and, asc, desc, eq, gte, inArray, lt, lte, ne, notExists, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { db } from "@/db";
import { clients, financialEntries, paymentChargeEvents, paymentCharges } from "@/db/schema";
import { managedChargeStatuses } from "./finance-view";

export type ChargeListFilters = { busca?: string; status?: string; meio?: string; inicio?: string; fim?: string; pagina?: string; cobranca?: string };
export const chargePageSize = 20;

export function chargeListCondition(organizationId: string, filters: ChargeListFilters, today: string) {
  const conditions: SQL[] = [eq(paymentCharges.organizationId, organizationId)];
  if (filters.cobranca) conditions.push(z.uuid().safeParse(filters.cobranca).success ? eq(paymentCharges.id, filters.cobranca) : sql`false`);
  const search = filters.busca?.trim();
  // strpos treats %, _ and backslashes literally, matching the former includes search.
  if (search) conditions.push(sql`strpos(lower(concat(${paymentCharges.customerName}, ' ', ${paymentCharges.description}, ' ', coalesce(${paymentCharges.customerDocument}, ''))), lower(${search})) > 0`);
  if (filters.status && filters.status !== "all") {
    conditions.push(filters.status === "overdue"
      ? or(eq(paymentCharges.status, "overdue"), and(eq(paymentCharges.status, "pending"), lt(paymentCharges.dueDate, today)))!
      : filters.status === "pending" ? and(eq(paymentCharges.status, "pending"), gte(paymentCharges.dueDate, today))!
        : eq(paymentCharges.status, filters.status));
  }
  if (filters.meio && filters.meio !== "all") conditions.push(eq(paymentCharges.paymentMethod, filters.meio));
  for (const [value, compare] of [[filters.inicio, gte], [filters.fim, lte]] as const) {
    if (value) conditions.push(z.iso.date().safeParse(value).success ? compare(paymentCharges.dueDate, value) : sql`false`);
  }
  return and(...conditions)!;
}

export async function loadChargeList(database: typeof db, organizationId: string, filters: ChargeListFilters, today: string) {
  const condition = chargeListCondition(organizationId, filters, today);
  const overdue = or(eq(paymentCharges.status, "overdue"), and(eq(paymentCharges.status, "pending"), lt(paymentCharges.dueDate, today)));
  const [totals] = await database.select({
    count: sql<number>`count(*)`.mapWith(Number),
    paidCount: sql<number>`count(*) filter (where ${paymentCharges.status} = 'paid')`.mapWith(Number),
    paidAmount: sql<number>`coalesce(sum(${paymentCharges.amountInCents}) filter (where ${paymentCharges.status} = 'paid'), 0)`.mapWith(Number),
    openCount: sql<number>`count(*) filter (where ${paymentCharges.status} in ('pending','overdue'))`.mapWith(Number),
    openAmount: sql<number>`coalesce(sum(${paymentCharges.amountInCents}) filter (where ${paymentCharges.status} in ('pending','overdue')), 0)`.mapWith(Number),
    overdueCount: sql<number>`count(*) filter (where ${overdue})`.mapWith(Number),
    overdueAmount: sql<number>`coalesce(sum(${paymentCharges.amountInCents}) filter (where ${overdue}), 0)`.mapWith(Number),
  }).from(paymentCharges).where(condition);
  const pages = Math.max(1, Math.ceil(totals.count / chargePageSize));
  const requested = Number(filters.pagina);
  const currentPage = Math.min(pages, Number.isFinite(requested) ? Math.max(1, Math.floor(requested)) : 1);
  const charges = await database.select().from(paymentCharges).where(condition)
    .orderBy(desc(paymentCharges.createdAt), desc(paymentCharges.id)).limit(chargePageSize).offset((currentPage - 1) * chargePageSize);
  const events = charges.length ? await database.select({
    id: paymentChargeEvents.id, chargeId: paymentChargeEvents.chargeId, eventType: paymentChargeEvents.eventType,
    status: paymentChargeEvents.status, createdAt: paymentChargeEvents.createdAt,
  }).from(paymentChargeEvents).where(and(eq(paymentChargeEvents.organizationId, organizationId), inArray(paymentChargeEvents.chargeId, charges.map(charge => charge.id))))
    .orderBy(desc(paymentChargeEvents.createdAt), desc(paymentChargeEvents.id)) : [];
  return { totals, charges, events, pages, currentPage };
}

export async function loadChargeableEntries(database: typeof db, organizationId: string) {
  return database.select({ id: financialEntries.id, description: financialEntries.description,
    amountInCents: financialEntries.amountInCents, dueDate: financialEntries.dueDate,
    clientName: clients.name, clientEmail: clients.email, clientPhone: clients.phone,
  }).from(financialEntries).leftJoin(clients, and(eq(clients.id, financialEntries.clientId), eq(clients.organizationId, organizationId)))
    .where(and(eq(financialEntries.organizationId, organizationId), eq(financialEntries.type, "receivable"),
      eq(financialEntries.status, "pending"), ne(financialEntries.source, "retail_sale"),
      notExists(database.select({ id: paymentCharges.id }).from(paymentCharges).where(and(
        eq(paymentCharges.organizationId, organizationId), eq(paymentCharges.financialEntryId, financialEntries.id), inArray(paymentCharges.status, managedChargeStatuses),
      )))))
    .orderBy(asc(financialEntries.dueDate), asc(financialEntries.id));
}
