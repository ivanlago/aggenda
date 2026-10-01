import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documentTemplates, organizations } from "@/db/schema";
import { documentPresets } from "@/lib/document-presets";
import { legalDefinitions } from "@/lib/legal-documents";

export async function syncDocumentPresets(organizationId: string, userId: string, updateExisting = false) {
  return db.transaction(async tx => {
    // Serializes initial installation and explicit updates for this organization.
    const [organization] = await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).limit(1).for("update");
    if (!organization) throw new Error("Organização não encontrada.");
    const existing = await tx.select().from(documentTemplates).where(eq(documentTemplates.organizationId, organizationId));
    let installed = 0, updated = 0;
    for (const preset of documentPresets) {
      const native = existing.find(item => item.name === preset.name && item.isSystemPreset);
      if (!native) {
        await tx.insert(documentTemplates).values({ ...preset, organizationId, createdByUserId: userId, isSystemPreset: true });
        installed++;
        continue;
      }
      const definition = legalDefinitions.find(item => item.name === preset.name);
      const previousMeta = native.responseSchema?.find(item => item.kind === "legal_document");
      const needsLegalUpgrade = definition && (previousMeta?.key !== definition.key || Number(previousMeta.version ?? 0) < 1);
      if (!updateExisting && !needsLegalUpgrade) continue;
      const responseSchema = definition ? [{ kind: "legal_document", key: definition.key, version: 1, ...(previousMeta?.defaultsByService ? { defaultsByService: previousMeta.defaultsByService } : {}) }] : native.responseSchema;
      await tx.update(documentTemplates).set({ content: preset.content, title: preset.title, documentType: preset.documentType, workflowType: preset.workflowType, responseSchema, updatedAt: new Date() }).where(eq(documentTemplates.id, native.id));
      updated++;
    }
    return { installed, updated };
  });
}
