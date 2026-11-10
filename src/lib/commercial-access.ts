import { and, count, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { commercialContracts, commercialUsage, commercialOrders, organizationMembers, professionals } from "@/db/schema";
import { addCalendarMonths } from "./commercial-catalog";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type UsageMetric = "responses" | "documents" | "notes";
export function usagePeriod(startedAt: Date, now = new Date(), trial = false) {
  if (trial) return startedAt.toISOString().slice(0, 10);
  let months = (now.getUTCFullYear() - startedAt.getUTCFullYear()) * 12 + now.getUTCMonth() - startedAt.getUTCMonth();
  if (addCalendarMonths(startedAt, months) > now) months--;
  return addCalendarMonths(startedAt, Math.max(0, months)).toISOString().slice(0, 10);
}

/** Serialize quota reservations on the organization's contract, including concurrent requests. */
export async function reserveCommercialUsage(tx: Tx, organizationId: string, metric: UsageMetric, resourceId: string) {
  const [contract] = await tx.select().from(commercialContracts).where(eq(commercialContracts.organizationId, organizationId)).for("update");
  if (!contract) return true; // Legacy organizations retain their existing entitlements.
  const [existing] = await tx.select().from(commercialUsage).where(and(eq(commercialUsage.organizationId, organizationId), eq(commercialUsage.metric, metric), eq(commercialUsage.resourceId, resourceId)));
  if (existing && existing.state !== "released") return metric !== "responses";
  const now = new Date();
  if (contract.endsAt <= now) throw new Error("Seu período de acesso terminou. Consulte Plano e cobrança.");
  const baseLimit = { responses: contract.responseLimit, documents: contract.documentLimit, notes: contract.noteLimit }[metric];
  const credits = await tx.select().from(commercialOrders).where(and(eq(commercialOrders.organizationId, organizationId), eq(commercialOrders.status, "active"), sql`${commercialOrders.periodEnd} > ${now}`));
  const addon = metric === "documents" ? Math.max(0, ...credits.filter(order => order.quote.kind === "addon" && order.quote.contractOrderId === contract.orderId).map(order => order.quote.kind === "addon" ? (order.quote.firstPeriod === usagePeriod(contract.startedAt, now) ? order.quote.initialDocumentLimit : 50) : 0)) : 0;
  const limit = Math.max(baseLimit, addon) + credits.reduce((sum, order) => sum + (order.quote.kind === "extra" && order.quote.extraMetric === metric ? order.quote.extraQuantity : 0), 0);
  const periodStart = usagePeriod(contract.startedAt, now, contract.kind === "trial");
  const [usage] = await tx.select({ total: count() }).from(commercialUsage).where(and(eq(commercialUsage.organizationId, organizationId), eq(commercialUsage.metric, metric), eq(commercialUsage.periodStart, periodStart), ne(commercialUsage.state, "released")));
  if (usage.total >= limit) throw new Error("Franquia esgotada. Consulte Plano e cobrança antes de iniciar novas operações.");
  await tx.insert(commercialUsage).values({ organizationId, metric, resourceId, periodStart }).onConflictDoUpdate({
    target: [commercialUsage.organizationId, commercialUsage.metric, commercialUsage.resourceId], set: { state: "reserved", periodStart },
  });
  return true;
}

export async function commercialTeamSlots(database: Pick<typeof db, "select">, organizationId: string) {
  const [activeProfessionals, members] = await Promise.all([
    database.select({ userId: professionals.userId }).from(professionals)
      .where(and(eq(professionals.organizationId, organizationId), eq(professionals.isActive, true))),
    database.select({ userId: organizationMembers.userId, role: organizationMembers.role }).from(organizationMembers)
      .where(eq(organizationMembers.organizationId, organizationId)),
  ]);
  const linkedUsers = new Set(activeProfessionals.map(professional => professional.userId));
  let attendants = activeProfessionals.length;
  let administrators = 0;
  let receptionists = 0;
  let otherMembers = 0;
  for (const member of members) {
    if (linkedUsers.has(member.userId)) continue;
    if (member.role === "professional") attendants++;
    else if (member.role === "owner" || member.role === "admin") administrators++;
    else if (member.role === "receptionist") receptionists++;
    else otherMembers++;
  }
  // The first paid slot is reserved for an attendant. The two included logins are role-specific.
  return Math.max(1, attendants) + Math.max(0, administrators - 1) + Math.max(0, receptionists - 1) + otherMembers;
}

export class CommercialTeamCapacityError extends Error {}

export async function checkTeamCapacityAfterChange(tx: Tx, organizationId: string) {
  const [contract] = await tx.select().from(commercialContracts).where(eq(commercialContracts.organizationId, organizationId)).for("update");
  if (!contract) return async () => {};
  const before = await commercialTeamSlots(tx, organizationId);
  return async () => {
    const after = await commercialTeamSlots(tx, organizationId);
    if (after > Math.max(before, contract.professionalLimit)) {
      throw new CommercialTeamCapacityError("Este cadastro precisa de uma vaga adicional. Consulte Plano e cobrança.");
    }
  };
}

export async function commercialUsageSummary(organizationId: string) {
  const [contract] = await db.select().from(commercialContracts).where(eq(commercialContracts.organizationId, organizationId));
  if (!contract) return null;
  const period = usagePeriod(contract.startedAt, new Date(), contract.kind === "trial");
  const rows = await db.select({ metric: commercialUsage.metric, quantity: sql<number>`count(*)::int` }).from(commercialUsage)
    .where(and(eq(commercialUsage.organizationId, organizationId), eq(commercialUsage.periodStart, period), ne(commercialUsage.state, "released"))).groupBy(commercialUsage.metric);
  const credits = await db.select().from(commercialOrders).where(and(eq(commercialOrders.organizationId, organizationId), eq(commercialOrders.status, "active"), sql`${commercialOrders.periodEnd} > ${new Date()}`));
  const available = { responses: contract.responseLimit, documents: contract.documentLimit, notes: contract.noteLimit };
  for (const credit of credits) if (credit.quote.kind === "extra") available[credit.quote.extraMetric] += credit.quote.extraQuantity;
  const signatureAddon = credits.find(order => order.quote.kind === "addon" && order.quote.contractOrderId === contract.orderId);
  if (signatureAddon?.quote.kind === "addon") available.documents = Math.max(contract.documentLimit, signatureAddon.quote.firstPeriod === period ? signatureAddon.quote.initialDocumentLimit : 50) + credits.reduce((sum, order) => sum + (order.quote.kind === "extra" && order.quote.extraMetric === "documents" ? order.quote.extraQuantity : 0), 0);
  return { signatureAddon, contract, period, available, quantities: Object.fromEntries(rows.map((r) => [r.metric, r.quantity])) };
}
