import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { documentTemplates, organizations } from "../src/db/schema";
import { documentPresets } from "../src/lib/document-presets";
async function main() {
 const organizationName = process.argv[2];
 if (!organizationName) throw new Error("Informe o nome da organização.");
 const matches = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.name, organizationName));
 if (matches.length !== 1) throw new Error("A organização deve corresponder a um único cadastro.");
 const organizationId = matches[0].id;
 await db.transaction(async tx => {
 for (const preset of documentPresets.filter(item => ["report", "companion_declaration"].includes(item.documentType))) {
 const [existing] = await tx.select({ id: documentTemplates.id }).from(documentTemplates).where(and(eq(documentTemplates.organizationId, organizationId), eq(documentTemplates.name, preset.name), eq(documentTemplates.isSystemPreset, true))).limit(1);
 if (existing) await tx.update(documentTemplates).set({ ...preset, isActive: true, updatedAt: new Date() }).where(eq(documentTemplates.id, existing.id));
 else await tx.insert(documentTemplates).values({ ...preset, organizationId, isSystemPreset: true });
 }
 });
 const installed = await db.select({ name: documentTemplates.name, native: documentTemplates.isSystemPreset, active: documentTemplates.isActive }).from(documentTemplates).where(and(eq(documentTemplates.organizationId, organizationId), eq(documentTemplates.isSystemPreset, true)));
 console.log(JSON.stringify(installed.filter(item => ["Laudo profissional", "Declaração acompanhante"].includes(item.name))));
}
main().then(() => process.exit(0)).catch(() => { console.error("Não foi possível instalar os modelos clínicos."); process.exit(1); });
