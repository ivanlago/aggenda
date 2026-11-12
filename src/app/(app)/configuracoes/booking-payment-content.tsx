import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { financialAccounts, organizationFinancialIntegrations } from "@/db/schema";
import { BookingPaymentSettingsForm } from "@/components/booking-payment-settings";
import { hasOrganizationPermission } from "@/lib/permissions";
import { posProviderNames, posProviderReady } from "@/lib/pos-providers";
import { requireOrganization } from "@/lib/session";

export async function BookingPaymentSettingsContent() {
  const { organization } = await requireOrganization();
  if (!hasOrganizationPermission(organization.role, "integrations.manage")) return <p className="text-sm text-muted">Peça ao administrador com permissão para gerenciar integrações para configurar o pagamento antecipado.</p>;
  const [accounts, integrations] = await Promise.all([
    db.select({ id: financialAccounts.id, name: financialAccounts.name }).from(financialAccounts).where(and(eq(financialAccounts.organizationId, organization.id), eq(financialAccounts.isActive, true))).orderBy(financialAccounts.name),
    db.select({ provider: organizationFinancialIntegrations.provider, status: organizationFinancialIntegrations.status, metadata: organizationFinancialIntegrations.metadata }).from(organizationFinancialIntegrations).where(and(eq(organizationFinancialIntegrations.organizationId, organization.id), eq(organizationFinancialIntegrations.isDefaultPos, true))),
  ]);
  const provider = integrations.find(posProviderReady);
  return <BookingPaymentSettingsForm settings={organization.bookingPaymentSettings} accounts={accounts} defaultProviderName={provider ? posProviderNames[provider.provider] : undefined} />;
}
