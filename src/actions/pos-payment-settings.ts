"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { organizationFinancialIntegrations } from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { assertOrganizationPermission } from "@/lib/permissions";
import { getMercadoPagoCredential } from "@/lib/mercado-pago";
import { writeAuditLog } from "@/lib/audit";

export async function setPosPaymentDefault(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "integrations.manage");
  const enabled = data.get("enabled") === "true";
  if (enabled) {
    const credential = await getMercadoPagoCredential(organization.id);
    if (!credential.webhookSecret) return { error: "Configure a assinatura secreta do webhook antes de usar o Mercado Pago no PDV." };
  }
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`pos-default:${organization.id}`},0))`);
    await tx.update(organizationFinancialIntegrations).set({ isDefaultPos: false }).where(eq(organizationFinancialIntegrations.organizationId, organization.id));
    if (enabled) await tx.update(organizationFinancialIntegrations).set({ isDefaultPos: true }).where(and(
      eq(organizationFinancialIntegrations.organizationId, organization.id), eq(organizationFinancialIntegrations.provider, "mercado_pago"), eq(organizationFinancialIntegrations.status, "active")));
  });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "set_pos_default", entityType: "financial_integration", details: { provider: enabled ? "mercado_pago" : "manual" } });
  revalidatePath("/vendas"); revalidatePath("/financeiro/cobrancas");
}
