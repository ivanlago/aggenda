import { and, eq } from "drizzle-orm";
import type { db } from "../../db";
import { auditLogs, documentArtifacts, documentSignatureBlobs } from "../../db/schema";
import { createHash } from "node:crypto";
import type { SignatureEncryption } from "./encryption";

/** Bounded, tenant-scoped rotation. The plaintext PDF and its signature never change. */
export async function rotateSignatureStorage(database: typeof db, organizationId: string,
  encryption: SignatureEncryption, apply = false) {
  return database.transaction(async (tx) => {
    // Bound memory and transaction duration. Pilot maintenance must be explicitly batched later.
    const keys = await tx.select({ storageKey: documentSignatureBlobs.storageKey }).from(documentSignatureBlobs)
      .where(eq(documentSignatureBlobs.organizationId, organizationId)).limit(501);
    if (keys.length > 500) throw new Error("Mais de 500 arquivos. A rotação exige manutenção em lotes.");
    let rotated = 0;
    let bytes = 0;
    for (const { storageKey } of keys) {
      const [row] = await tx.select().from(documentSignatureBlobs).where(and(
        eq(documentSignatureBlobs.organizationId, organizationId), eq(documentSignatureBlobs.storageKey, storageKey),
      )).for("update");
      if (!row) throw new Error("Arquivo indisponível durante a conferência.");
      const pdf = encryption.decrypt(organizationId, storageKey, row.encryptedContent);
      bytes += pdf.byteLength;
      if (bytes > 100 * 1024 * 1024) throw new Error("Mais de 100 MiB. A rotação exige manutenção em lotes.");
      const [artifact] = await tx.select({ sha256: documentArtifacts.sha256, size: documentArtifacts.sizeBytes })
        .from(documentArtifacts).where(and(eq(documentArtifacts.organizationId, organizationId), eq(documentArtifacts.storageKey, storageKey))).limit(1);
      if (artifact && (artifact.sha256 !== createHash("sha256").update(pdf).digest("hex") || artifact.size !== pdf.byteLength)) {
        throw new Error("Integridade do arquivo não confirmada. Nenhuma rotação foi concluída.");
      }
      const encrypted = encryption.rotate(organizationId, storageKey, row.encryptedContent);
      if (encrypted === row.encryptedContent) continue;
      rotated++;
      if (apply) await tx.update(documentSignatureBlobs).set({ encryptedContent: encrypted }).where(and(
        eq(documentSignatureBlobs.organizationId, organizationId), eq(documentSignatureBlobs.storageKey, storageKey),
      ));
    }
    if (apply && rotated) await tx.insert(auditLogs).values({ organizationId,
      action: "rotate_signature_storage", entityType: "document_signature_storage",
      details: { files: rotated, keyId: encryption.activeKey, source: "maintenance_script" } });
    // New writes during maintenance already use the active key. Keep old keys for backups.
    return { mode: apply ? "applied" : "dry_run", checked: keys.length, rotated, bytes, activeKeyId: encryption.activeKey };
  });
}
