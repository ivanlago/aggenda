import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { db } from "@/db";
import { cashClosings, cashMovements, posCashAdjustments, retailSalePayments } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";

type CashTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function canOperatePosCash(role: string) {
  return role === "professional"
    || hasOrganizationPermission(role, "sales.sell")
    || hasOrganizationPermission(role, "inventory.manage")
    || hasOrganizationPermission(role, "finance.manage");
}

function operatorOpenCash(organizationId: string, userId: string) {
  return and(eq(cashClosings.organizationId, organizationId), eq(cashClosings.openedByUserId, userId),
    isNull(cashClosings.accountId), isNull(cashClosings.closedAt));
}

export async function getOpenPosCash(database: typeof db, organizationId: string, userId: string): Promise<{ id: string; openedAt: Date } | null> {
  const [cash] = await database.select({ id: cashClosings.id, openedAt: cashClosings.openedAt }).from(cashClosings)
    .where(operatorOpenCash(organizationId, userId)).limit(1);
  return cash ?? null;
}

export async function requireOpenPosCash(tx: CashTransaction, organizationId: string, userId: string, expectedId?: string) {
  const [cash] = await tx.select({ id: cashClosings.id }).from(cashClosings)
    .where(and(operatorOpenCash(organizationId, userId), expectedId ? eq(cashClosings.id, expectedId) : undefined))
    .limit(1).for("update");
  if (!cash) throw new Error("Abra seu caixa ou atualize a venda para usar a sessão atual.");
  return cash.id;
}

export async function openPosCash(database: typeof db, organizationId: string, userId: string, amount: number) {
  await database.insert(cashClosings).values({
    organizationId, openedByUserId: userId, openingBalanceInCents: amount,
    openedAt: sql`timezone('UTC', clock_timestamp())`,
  }).onConflictDoNothing();
}

async function lockPosCash(tx: CashTransaction, organizationId: string, userId: string, id: string, manageAll: boolean) {
  const [cash] = await tx.select().from(cashClosings)
    .where(and(eq(cashClosings.id, id), eq(cashClosings.organizationId, organizationId), isNull(cashClosings.accountId),
      manageAll ? undefined : eq(cashClosings.openedByUserId, userId))).for("update");
  if (!cash) throw new Error("Caixa indisponível para este operador.");
  return cash;
}

export async function loadPosCashActivity(database: typeof db | CashTransaction, organizationId: string, sessionId: string) {
  const [payments, adjustments] = await Promise.all([
    database.select({
      id: cashMovements.id, occurredAt: cashMovements.occurredAt, amount: cashMovements.amountInCents,
      method: retailSalePayments.method, name: cashMovements.paymentMethodName, methodId: cashMovements.paymentMethodId,
    }).from(cashMovements)
      .innerJoin(retailSalePayments, and(eq(cashMovements.sourceId, retailSalePayments.id), eq(retailSalePayments.organizationId, organizationId)))
      .where(and(eq(cashMovements.organizationId, organizationId), eq(cashMovements.cashClosingId, sessionId), eq(cashMovements.sourceType, "sale_payment")))
      .orderBy(asc(cashMovements.occurredAt), asc(cashMovements.id)),
    database.select().from(posCashAdjustments).where(eq(posCashAdjustments.cashClosingId, sessionId)).orderBy(asc(posCashAdjustments.createdAt)),
  ]);
  return { payments, adjustments };
}

export function posCashBalance(opening: number, activity: Awaited<ReturnType<typeof loadPosCashActivity>>) {
  const cashPayments = activity.payments.reduce((total, payment) => total + (payment.method === "cash" ? payment.amount : 0), 0);
  const adjustments = activity.adjustments.reduce((total, adjustment) => total + (adjustment.kind === "supply" ? adjustment.amountInCents : -adjustment.amountInCents), 0);
  return opening + cashPayments + adjustments;
}

export async function recordPosCashAdjustment(database: typeof db, input: {
  organizationId: string; userId: string; sessionId: string; adjustmentId: string;
  manageAll: boolean; kind: "supply" | "withdrawal"; amount: number; reason: string;
}) {
  await database.transaction(async (tx) => {
    const cash = await lockPosCash(tx, input.organizationId, input.userId, input.sessionId, input.manageAll);
    const [existing] = await tx.select({ id: posCashAdjustments.id }).from(posCashAdjustments)
      .where(and(eq(posCashAdjustments.id, input.adjustmentId), eq(posCashAdjustments.cashClosingId, cash.id)));
    if (existing) return;
    if (cash.closedAt) throw new Error("Este caixa já foi fechado.");
    await tx.insert(posCashAdjustments).values({
      id: input.adjustmentId, cashClosingId: cash.id, userId: input.userId, kind: input.kind,
      amountInCents: input.amount, reason: input.reason, createdAt: sql`timezone('UTC', clock_timestamp())`,
    });
  });
}

export async function closePosCash(database: typeof db, organizationId: string, userId: string, id: string, manageAll: boolean, counted: number, notes: string) {
  return database.transaction(async (tx) => {
    const cash = await lockPosCash(tx, organizationId, userId, id, manageAll);
    if (cash.closedAt) throw new Error("Este caixa já foi fechado.");
    const activity = await loadPosCashActivity(tx, organizationId, id);
    const expected = posCashBalance(cash.openingBalanceInCents, activity);
    const difference = counted - expected;
    if (![expected, difference].every(value => Number.isSafeInteger(value) && Math.abs(value) <= 2147483647)) {
      throw new Error("O saldo ultrapassa o limite permitido para este fechamento.");
    }
    await tx.update(cashClosings).set({
      closedByUserId: userId, closedAt: sql`timezone('UTC', clock_timestamp())`, expectedBalanceInCents: expected,
      countedBalanceInCents: counted, differenceInCents: difference, notes: notes || null,
    }).where(eq(cashClosings.id, id));
    return { expected, counted, difference };
  });
}
