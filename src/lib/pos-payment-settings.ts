import { eq } from "drizzle-orm";
import { buildPosPaymentSettings } from "./pos-providers";
import { db } from "@/db";
import { organizationFinancialIntegrations } from "@/db/schema";

export async function posPaymentSettings(organizationId: string) {
  const rows = await db.select({ provider: organizationFinancialIntegrations.provider, status: organizationFinancialIntegrations.status,
    environment: organizationFinancialIntegrations.environment, metadata: organizationFinancialIntegrations.metadata,
    isDefault: organizationFinancialIntegrations.isDefaultPos }).from(organizationFinancialIntegrations).where(eq(organizationFinancialIntegrations.organizationId, organizationId));
  return buildPosPaymentSettings(rows);
}
