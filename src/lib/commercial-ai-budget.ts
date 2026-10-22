import { and, eq, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { commercialContracts, organizationUsageCounters, commercialOrders } from "@/db/schema";
import { usagePeriod } from "./commercial-access";

/** Reserve a conservative upper bound before the paid request, in millionths of USD. */
export async function reserveAgentAiBudget(organizationId: string | undefined, model: string, bytes: number, outputTokens: number, db = defaultDb) {
  if (!organizationId) return null;
  // Unknown models use conservative rates until their provider account budget is reviewed.
  const rates = model.includes("gemini-3.1-flash-lite") ? { input: 0.25, output: 1.5 } : { input: 5, output: 25 };
  const reservation = Math.ceil(bytes * rates.input + outputTokens * rates.output);
  return db.transaction(async (tx) => {
    const [contract] = await tx.select().from(commercialContracts).where(eq(commercialContracts.organizationId, organizationId)).for("update");
    if (!contract) return null;
    if (contract.endsAt <= new Date()) throw new Error("Período de acesso encerrado.");
    const credits = await tx.select().from(commercialOrders).where(and(eq(commercialOrders.organizationId, organizationId), eq(commercialOrders.status, "active"), sql`${commercialOrders.periodEnd} > ${new Date()}`));
    const prepaidBudget = credits.reduce((sum, order) => sum + (order.quote.kind === "extra" && order.quote.extraMetric === "responses" ? order.quote.extraQuantity / 500 * 2_000_000 : 0), 0);
    const cap = (contract.kind === "trial" ? 2_000_000 : 5_000_000) + prepaidBudget;
    const periodStart = usagePeriod(contract.startedAt, new Date(), contract.kind === "trial");
    const metric = "commercial.ai_microusd";
    const [usage] = await tx.select().from(organizationUsageCounters).where(and(eq(organizationUsageCounters.organizationId, organizationId), eq(organizationUsageCounters.periodStart, periodStart), eq(organizationUsageCounters.metric, metric)));
    if ((usage?.quantity ?? 0) + reservation > cap) throw new Error("Limite interno de processamento atingido. Atendimento encaminhado à equipe.");
    await tx.insert(organizationUsageCounters).values({ organizationId, periodStart, metric, quantity: reservation }).onConflictDoUpdate({
      target: [organizationUsageCounters.organizationId, organizationUsageCounters.periodStart, organizationUsageCounters.metric],
      set: { quantity: sql`${organizationUsageCounters.quantity} + ${reservation}`, updatedAt: new Date() },
    });
    return { organizationId, periodStart, metric, reservation, rates };
  });
}

export async function settleAgentAiBudget(reserved: Awaited<ReturnType<typeof reserveAgentAiBudget>>, inputTokens?: number, outputTokens?: number, db = defaultDb) {
  // Missing usage or a failed HTTP request may already have incurred cost: keep the reservation.
  if (!reserved || inputTokens == null || outputTokens == null) return;
  const actual = Math.ceil(inputTokens * reserved.rates.input + outputTokens * reserved.rates.output);
  const refund = Math.max(0, reserved.reservation - actual);
  if (!refund) return;
  await db.update(organizationUsageCounters).set({ quantity: sql`greatest(0, ${organizationUsageCounters.quantity} - ${refund})`, updatedAt: new Date() }).where(and(
    eq(organizationUsageCounters.organizationId, reserved.organizationId), eq(organizationUsageCounters.periodStart, reserved.periodStart), eq(organizationUsageCounters.metric, reserved.metric),
  ));
}
