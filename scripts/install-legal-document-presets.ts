import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { organizations, documentTemplates } from "../src/db/schema";
import { legalDocumentPresets } from "../src/lib/legal-documents";
async function main() {
 const name = process.argv[2];
 if (!name) throw new Error("Informe a organização.");
 const matches = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.name, name));
 if (matches.length !== 1) throw new Error("Organização deve ser única.");
 const organizationId = matches[0].id;
 await db.transaction(async tx => {
 for (const preset of legalDocumentPresets) {
 const [native] = await tx.select().from(documentTemplates).where(and(eq(documentTemplates.organizationId, organizationId), eq(documentTemplates.name, preset.name), eq(documentTemplates.isSystemPreset, true))).limit(1);
 if (native) { const previous = native.responseSchema?.find(item => item.kind === "legal_document"); await tx.update(documentTemplates).set({ ...preset, responseSchema: preset.responseSchema.map(item => ({ ...item, ...(previous?.defaultsByService ? { defaultsByService: previous.defaultsByService } : {}) })), isActive: true, updatedAt: new Date() }).where(eq(documentTemplates.id, native.id)); }
 else await tx.insert(documentTemplates).values({ ...preset, organizationId, isSystemPreset: true });
 }
 });
 console.log(`Instalados ${legalDocumentPresets.length} modelos jurídicos nativos.`);
}
main().then(() => process.exit(0)).catch(() => { console.error("Falha ao instalar a biblioteca jurídica."); process.exit(1); });
