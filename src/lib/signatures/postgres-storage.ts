import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { db } from "@/db";
import { documentSignatureBlobs } from "@/db/schema";
import { SignatureEncryption } from "./encryption";
import type { SignatureStorage } from "./types";

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export const maxSignaturePdfBytes = 10 * 1024 * 1024;

/** Private encrypted storage in the existing database, suitable for the initial pilot. */
export class PostgresSignatureStorage implements SignatureStorage {
  constructor(private readonly database: typeof db, private readonly encryption: SignatureEncryption) {}

  async put(organizationId: string, storageKey: string, pdf: Uint8Array): Promise<void> {
    const frozen = Uint8Array.from(pdf);
    if (!organizationId || !storageKey || !frozen.byteLength || frozen.byteLength > maxSignaturePdfBytes) {
      throw new Error("Arquivo fora dos limites do armazenamento de assinaturas.");
    }
    const inserted = await this.database.insert(documentSignatureBlobs).values({
      organizationId, storageKey,
      encryptedContent: this.encryption.encrypt(organizationId, storageKey, frozen),
    }).onConflictDoNothing({ target: [documentSignatureBlobs.organizationId, documentSignatureBlobs.storageKey] })
      .returning({ storageKey: documentSignatureBlobs.storageKey });
    if (!inserted.length && digest(await this.get(organizationId, storageKey)) !== digest(frozen)) {
      throw new Error("Não é permitido substituir um arquivo de assinatura.");
    }
  }

  async get(organizationId: string, storageKey: string): Promise<Uint8Array> {
    const [blob] = await this.database.select({ encryptedContent: documentSignatureBlobs.encryptedContent })
      .from(documentSignatureBlobs).where(and(
        eq(documentSignatureBlobs.organizationId, organizationId), eq(documentSignatureBlobs.storageKey, storageKey),
      )).limit(1);
    if (!blob) throw new Error("Arquivo de assinatura não encontrado.");
    return this.encryption.decrypt(organizationId, storageKey, blob.encryptedContent);
  }
}
