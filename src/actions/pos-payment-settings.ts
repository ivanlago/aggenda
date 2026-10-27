"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { organizationFinancialIntegrations } from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { assertOrganizationPermission } from "@/lib/permissions";
import { posProviderNames, posProviderReady } from "@/lib/pos-providers";
import { writeAuditLog } from "@/lib/audit";

export async function setPosPaymentDefault(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "integrations.manage");
  const enabled = data.get("enabled") === "true";
  const provider = String(data.get("provider") ?? "mercado_pago");
  if (!Object.hasOwn(posProviderNames,provider)) return { error: "Provedor indisponível no PDV." };
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`pos-default:${organization.id}`},0))`);
    const [selected] = await tx.select().from(organizationFinancialIntegrations).where(and(eq(organizationFinancialIntegrations.organizationId, organization.id), eq(organizationFinancialIntegrations.provider, provider))).for("update");
    if (enabled && (!selected || !posProviderReady(selected))) throw new Error("Conecte, valide e configure o webhook deste provedor antes de defini-lo como padrão do PDV.");
    await tx.update(organizationFinancialIntegrations).set({ isDefaultPos: false }).where(enabled ? eq(organizationFinancialIntegrations.organizationId, organization.id) : and(eq(organizationFinancialIntegrations.organizationId, organization.id), eq(organizationFinancialIntegrations.provider, provider)));
    if (enabled) await tx.update(organizationFinancialIntegrations).set({ isDefaultPos: true }).where(and(
      eq(organizationFinancialIntegrations.organizationId, organization.id), eq(organizationFinancialIntegrations.provider, provider), eq(organizationFinancialIntegrations.status, "active")));
  });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "set_pos_default", entityType: "financial_integration", details: { provider, enabled } });
  revalidatePath("/vendas"); revalidatePath("/financeiro/cobrancas");
}
