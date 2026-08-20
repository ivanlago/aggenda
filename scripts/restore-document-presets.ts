import "dotenv/config";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "../src/db";
import { documentTemplates, organizations } from "../src/db/schema";
import { documentPresets } from "../src/lib/document-presets";

async function main() {
  const organizationId = process.argv[2];
  if (!organizationId) {
    const rows = await db.select({ id: organizations.id, name: organizations.name }).from(organizations);
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  const [organization] = await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!organization) throw new Error("Organização não encontrada.");
  const presetNames = documentPresets.map((preset) => preset.name);
  const existing = await db.select({ name: documentTemplates.name }).from(documentTemplates).where(and(eq(documentTemplates.organizationId, organizationId), inArray(documentTemplates.name, presetNames)));
  const names = new Set(existing.map((item) => item.name));
  for (const preset of documentPresets) {
    if (names.has(preset.name)) {
      await db.update(documentTemplates).set({ title: preset.title, content: preset.content, documentType: preset.documentType, workflowType: preset.workflowType, isActive: true, isSystemPreset: true, updatedAt: new Date() }).where(and(eq(documentTemplates.organizationId, organizationId), eq(documentTemplates.name, preset.name)));
    } else {
      await db.insert(documentTemplates).values({ ...preset, organizationId, isSystemPreset: true });
    }
  }
  console.log(`Modelos originais restaurados para ${organization.name} (${organization.id}).`);
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
