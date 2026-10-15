import { cache } from "react";
import { requireOrganization } from "@/lib/session";
import { assertOrganizationPermission, hasOrganizationPermission } from "@/lib/permissions";
import { syncDocumentPresets } from "@/lib/document-presets-sync";

export const requireDocumentOrganization = cache(async () => {
  const context = await requireOrganization();
  assertOrganizationPermission(context.organization.role, "clinical.read");
  assertOrganizationPermission(context.organization.role, "documents.read");
  if (hasOrganizationPermission(context.organization.role, "documents.read")) {
    await syncDocumentPresets(context.organization.id, context.session.user.id);
  }
  return context;
});
