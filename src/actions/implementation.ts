"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { organizationImplementationPreferences } from "@/db/schema";
import {
  isFiscalSetupMode,
  isImplementationMode,
} from "@/lib/implementation-services";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export async function saveImplementationPreferences(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "organization.settings.manage");

  const implementationMode = String(formData.get("implementationMode") ?? "");
  const fiscalSetupMode = String(formData.get("fiscalSetupMode") ?? "");
  if (!isImplementationMode(implementationMode) || !isFiscalSetupMode(fiscalSetupMode)) {
    return { error: "Selecione opções de implantação válidas." };
  }

  const requestsAssistance = implementationMode === "assisted" || fiscalSetupMode === "assisted";
  await db
    .insert(organizationImplementationPreferences)
    .values({
      organizationId: organization.id,
      implementationMode,
      implementationStatus: implementationMode === "assisted" ? "requested" : "not_required",
      fiscalSetupMode,
      fiscalSetupStatus: fiscalSetupMode === "assisted" ? "requested" : "not_required",
      requestedAt: requestsAssistance ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: organizationImplementationPreferences.organizationId,
      set: {
        implementationMode,
        implementationStatus: implementationMode === "assisted" ? "requested" : "not_required",
        fiscalSetupMode,
        fiscalSetupStatus: fiscalSetupMode === "assisted" ? "requested" : "not_required",
        requestedAt: requestsAssistance ? new Date() : null,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/implantacao");
  revalidatePath("/assinatura");
}
