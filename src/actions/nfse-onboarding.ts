"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { writeAuditLog } from "@/lib/audit";
import { encryptFinancialCredential } from "@/lib/financial-secret";
import { nfseOnboardingSchema, storeNfseOnboarding } from "@/lib/nfse/onboarding";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export async function saveNfseOnboarding(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "integrations.manage");
  const result = nfseOnboardingSchema.safeParse(Object.fromEntries(["cnpj", "municipalityCode", "taxRegime", "municipalRegistration"].map((key) => [key, String(data.get(key) ?? "")])));
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Confira os dados fiscais." };
  await storeNfseOnboarding(db, organization.id, session.user.id, result.data, encryptFinancialCredential("onboarding-only"));
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "prepare_fiscal_onboarding", entityType: "financial_integration:nfse", details: { municipalityCode: result.data.municipalityCode, taxRegime: result.data.taxRegime } });
  revalidatePath("/financeiro/nfse");
}
