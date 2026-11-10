import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import type { db } from "@/db";
import { cashMovements, financialAccounts } from "@/db/schema";
import { zonedDate } from "@/lib/organization-time";

export async function loadFinancialStatement(database: typeof db, { organizationId, timezone, month, nextMonth, selectedAccount }: {
  organizationId: string; timezone: string; month: string; nextMonth: string; selectedAccount?: string;
}) {
  const start = zonedDate(month + "-01", "00:00", timezone);
  const end = zonedDate(nextMonth + "-01", "00:00", timezone);

  const { accounts, scopedAccounts, previous, movements } = await database.transaction(async (tx) => {
    const accounts = await tx.select().from(financialAccounts)
      .where(eq(financialAccounts.organizationId, organizationId))
      .orderBy(asc(financialAccounts.name));
    const account = accounts.find((item) => item.id === selectedAccount);
    const scopedAccounts = account ? [account] : accounts;
    const scope = and(eq(cashMovements.organizationId, organizationId), account ? eq(cashMovements.accountId, account.id) : undefined);
    const [previous] = await tx.select({ amount: sql<number>`coalesce(sum(${cashMovements.amountInCents}), 0)`.mapWith(Number) })
      .from(cashMovements).where(and(scope, lt(cashMovements.occurredAt, start)));
    const movements = await tx.select().from(cashMovements)
      .where(and(scope, gte(cashMovements.occurredAt, start), lt(cashMovements.occurredAt, end)))
      .orderBy(asc(cashMovements.occurredAt), asc(cashMovements.id));
    return { accounts, scopedAccounts, previous, movements };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });

  const accountNames = new Map(accounts.map((item) => [item.id, item.name]));
  const initialBalance = scopedAccounts.filter((item) => item.createdAt < start)
    .reduce((total, item) => total + item.openingBalanceInCents, previous.amount);
  const accountOpenings = scopedAccounts
    .filter((item) => item.createdAt >= start && item.createdAt < end && item.openingBalanceInCents !== 0)
    .map((item) => ({
      id: "abertura-" + item.id, accountId: item.id, occurredAt: item.createdAt, description: "Saldo inicial da conta",
      paymentMethodName: null, amountInCents: item.openingBalanceInCents,
    }));
  const ordered = [...accountOpenings, ...movements].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const rows: (typeof ordered[number] & { balance: number })[] = [];
  let balance = initialBalance;
  for (const item of ordered) {
    balance += item.amountInCents;
    rows.push({ ...item, balance });
  }

  return { accounts, accountNames, initialBalance, balance, rows };
}
