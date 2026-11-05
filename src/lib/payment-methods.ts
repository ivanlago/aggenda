import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentMethods, financialAccounts } from "@/db/schema";
import { choosePayment } from "./payment-catalog-policy";

export function activePaymentMethods(organizationId: string) {
  return db.select({ id: paymentMethods.id, name: paymentMethods.name, kind: paymentMethods.kind, provider: paymentMethods.provider, defaultAccountId: paymentMethods.defaultAccountId }).from(paymentMethods)
    .where(and(eq(paymentMethods.organizationId, organizationId), eq(paymentMethods.isActive, true)))
    .orderBy(asc(paymentMethods.name));
}

export async function organizationPaymentCatalog(organizationId: string) {
  const [methods, accounts] = await Promise.all([
    activePaymentMethods(organizationId),
    db.select({ id: financialAccounts.id, name: financialAccounts.name }).from(financialAccounts).where(and(eq(financialAccounts.organizationId, organizationId), eq(financialAccounts.isActive, true))).orderBy(asc(financialAccounts.name)),
  ]);
  return { methods, accounts };
}

export async function resolveOrganizationPayment(organizationId: string, token: string, accountId?: string | null, provider = "manual") {
  const { methods, accounts } = await organizationPaymentCatalog(organizationId);
  return choosePayment(methods, accounts, token, accountId, provider);
}
