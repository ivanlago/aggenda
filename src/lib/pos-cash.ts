import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { cashClosings, financialAccounts } from "@/db/schema";

export async function getPosCashRegisters(organizationId: string) {
  return db.select({ accountId: financialAccounts.id, name: financialAccounts.name, sessionId: cashClosings.id, openedAt: cashClosings.openedAt })
    .from(financialAccounts)
    .leftJoin(cashClosings, and(eq(cashClosings.accountId, financialAccounts.id), eq(cashClosings.organizationId, organizationId), isNull(cashClosings.closedAt)))
    .where(and(eq(financialAccounts.organizationId, organizationId), eq(financialAccounts.isActive, true), eq(financialAccounts.accountType, "cash")))
    .orderBy(financialAccounts.name);
}
