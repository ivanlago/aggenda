import { cache } from "react";
import { requireOrganization } from "@/lib/session";
import { hasOrganizationPermission } from "@/lib/permissions";
import { syncDocumentPresets } from "@/lib/document-presets-sync";

export const requireDocumentOrganization = cache(async () => {
  const context = await requireOrganization();
  if (hasOrganizationPermission(context.organization.role, "documents.read")) {
    await syncDocumentPresets(context.organization.id, context.session.user.id);
  }
  return context;
});
