import { eq } from "drizzle-orm";
import { posProviderNames, posProviderReady } from "./pos-providers";
import { db } from "@/db";
import { organizationFinancialIntegrations } from "@/db/schema";

export async function posPaymentSettings(organizationId: string) {
  const rows = await db.select({ provider: organizationFinancialIntegrations.provider, status: organizationFinancialIntegrations.status,
    environment: organizationFinancialIntegrations.environment, metadata: organizationFinancialIntegrations.metadata,
    isDefault: organizationFinancialIntegrations.isDefaultPos }).from(organizationFinancialIntegrations).where(eq(organizationFinancialIntegrations.organizationId, organizationId));
  const providers = rows.filter(posProviderReady).map(row => ({
    id: row.provider, name: posProviderNames[row.provider], environment: row.environment, isDefault: row.isDefault,
  }));
  return { providers, defaultProvider: providers.find(row => row.isDefault)?.id ?? "manual" };
}
