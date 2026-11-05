import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { db } from "@/db";
import { cashClosings, cashMovements, financialAccounts, financialEntries } from "@/db/schema";

export class CashClosingRepository {
  constructor(private readonly database: typeof db) {}

  async open(org: string, actor: string, accountId: string, openingBalanceInCents: number) {
    if (!Number.isSafeInteger(openingBalanceInCents) || openingBalanceInCents < 0 || openingBalanceInCents > 2147483647) throw new Error("Informe um saldo válido.");
    return this.database.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`cash-account:${org}:${accountId}`},0))`);
      const [account] = await tx.select().from(financialAccounts).where(and(eq(financialAccounts.id, accountId), eq(financialAccounts.organizationId, org), eq(financialAccounts.isActive, true)));
      if (!account) throw new Error("Selecione uma conta ativa da empresa.");
      const [open] = await tx.select().from(cashClosings).where(and(eq(cashClosings.organizationId, org), eq(cashClosings.accountId, accountId), isNull(cashClosings.closedAt)));
      if (open) throw new Error("Esta conta já possui caixa aberto.");
      return (await tx.insert(cashClosings).values({ organizationId: org, accountId, openedByUserId: actor, openingBalanceInCents, openedAt: sql`timezone('UTC',clock_timestamp())` }).returning())[0];
    });
  }

  async close(org: string, actor: string, id: string, counted: number, notes: string) {
    if (!Number.isSafeInteger(counted) || counted < 0 || counted > 2147483647) throw new Error("Informe um saldo contado válido.");
    return this.database.transaction(async tx => {
      const [candidate] = await tx.select().from(cashClosings).where(and(eq(cashClosings.id, id), eq(cashClosings.organizationId, org)));
      if (!candidate) throw new Error("Caixa não encontrado.");
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`cash-account:${org}:${candidate.accountId}`},0))`);
      const [cash] = await tx.select().from(cashClosings).where(and(eq(cashClosings.id, id), eq(cashClosings.organizationId, org), isNull(cashClosings.closedAt))).for("update");
      if (!cash) throw new Error("Este caixa já foi fechado.");
      const [{ at: closedAt }] = await tx.select({ at: sql`clock_timestamp()`.mapWith(value => new Date(value as string)) }).from(cashClosings).where(eq(cashClosings.id, id)).limit(1);
      const [unassigned] = await tx.select({ id: financialEntries.id }).from(financialEntries).where(and(eq(financialEntries.organizationId, org), isNull(financialEntries.accountId), eq(financialEntries.cashManagedBySale, false), gte(financialEntries.updatedAt, cash.openedAt), sql`${financialEntries.status} in ('received','paid')`)).limit(1);
      if (unassigned) throw new Error("Há lançamentos pagos ou recebidos sem conta de destino neste período. Regularize-os no financeiro antes de fechar.");
      const filter = and(eq(cashMovements.organizationId, org), eq(cashMovements.accountId, cash.accountId), isNull(cashMovements.cashClosingId), gte(cashMovements.occurredAt, cash.openedAt), lte(cashMovements.occurredAt, closedAt));
      const movements = await tx.select().from(cashMovements).where(filter);
      const expected = cash.openingBalanceInCents + movements.reduce((sum, movement) => sum + movement.amountInCents, 0);
      const difference = counted - expected;
      if (![expected, difference].every(value => Number.isSafeInteger(value) && Math.abs(value) <= 2147483647)) throw new Error("O saldo ultrapassa o limite permitido para este fechamento.");
      await tx.update(cashMovements).set({ cashClosingId: id }).where(filter);
      await tx.update(cashClosings).set({ closedByUserId: actor, closedAt, expectedBalanceInCents: expected, countedBalanceInCents: counted, differenceInCents: difference, notes: notes.trim() || null }).where(eq(cashClosings.id, id));
      return { expected, counted, difference, movements: movements.length };
    });
  }
}
