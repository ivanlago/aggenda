import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizationFinancialIntegrations } from "@/db/schema";

export async function posPaymentSettings(organizationId: string) {
  const rows = await db.select({ provider: organizationFinancialIntegrations.provider, status: organizationFinancialIntegrations.status,
    environment: organizationFinancialIntegrations.environment, metadata: organizationFinancialIntegrations.metadata,
    isDefault: organizationFinancialIntegrations.isDefaultPos }).from(organizationFinancialIntegrations).where(and(
    eq(organizationFinancialIntegrations.organizationId, organizationId), eq(organizationFinancialIntegrations.provider, "mercado_pago")));
  const providers = rows.filter(row => row.status === "active" && row.metadata?.webhookStatus === "configured").map(row => ({
    id: row.provider, name: "Mercado Pago", environment: row.environment, isDefault: row.isDefault,
  }));
  return { providers, defaultProvider: providers.find(row => row.isDefault)?.id ?? "manual" };
}
