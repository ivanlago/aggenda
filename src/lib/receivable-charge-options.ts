import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizationFinancialIntegrations } from "@/db/schema";
import { posProviderNames } from "./pos-providers";

export async function receivableChargeOptions(organizationId: string) {
  const rows = await db.select({
    id: organizationFinancialIntegrations.provider, isDefault: organizationFinancialIntegrations.isDefaultPos,
    environment: organizationFinancialIntegrations.environment,
  }).from(organizationFinancialIntegrations).where(and(
    eq(organizationFinancialIntegrations.organizationId, organizationId),
    eq(organizationFinancialIntegrations.status, "active"),
  ));
  return rows.filter(row => Object.hasOwn(posProviderNames, row.id)).map(row => ({ ...row, name: posProviderNames[row.id] }));
}
