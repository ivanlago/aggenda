import "dotenv/config";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { organizations, organizationMembers, documentTemplates, electronicDocuments } from "../src/db/schema";
import { syncDocumentPresets } from "../src/lib/document-presets-sync";
async function main() {
 const name = process.argv[2];
 if (!name) throw new Error("Informe a organização.");
 const matches = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.name, name));
 assert.equal(matches.length, 1);
 const organizationId = matches[0].id;
 const [member] = await db.select({ userId: organizationMembers.userId }).from(organizationMembers).where(eq(organizationMembers.organizationId, organizationId)).limit(1);
 assert.ok(member);
 const templates = () => db.select().from(documentTemplates).where(eq(documentTemplates.organizationId, organizationId)).orderBy(documentTemplates.id);
 const documents = () => db.select({ id: electronicDocuments.id, contentHash: electronicDocuments.contentHash, contentSnapshot: electronicDocuments.contentSnapshot }).from(electronicDocuments).where(eq(electronicDocuments.organizationId, organizationId)).orderBy(electronicDocuments.id);
 const [before, emitted] = await Promise.all([templates(), documents()]);
 await syncDocumentPresets(organizationId, member.userId);
 const first = await templates();
 const result = await syncDocumentPresets(organizationId, member.userId);
 const [second, emittedAfter] = await Promise.all([templates(), documents()]);
 assert.deepEqual(result, { installed: 0, updated: 0 });
 assert.deepEqual(first, second);
 assert.deepEqual(before.filter(item => !item.isSystemPreset), second.filter(item => !item.isSystemPreset));
 assert.deepEqual(emitted, emittedAfter);
 console.log("Disponibilização automática idempotente; modelos personalizados e documentos emitidos preservados.");
}
main().then(() => process.exit(0)).catch(() => { console.error("Falha na verificação da biblioteca de documentos."); process.exit(1); });
