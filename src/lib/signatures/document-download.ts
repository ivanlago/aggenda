import { sql } from "drizzle-orm";
import { db } from "@/db";
import { SignatureDeliveryUnavailable, readValidatedSignaturePdf } from "./delivery";
import { PostgresSignatureRepository } from "./postgres-repository";
import { signatureStorage } from "./storage-config";

export async function signatureDatabaseReady(): Promise<boolean> {
  // Keeps legacy downloads working before migration 0066 is applied.
  const result = await db.execute(sql`select to_regclass('public.document_signature_requests') is not null as ready`);
  return result.rows[0]?.ready === true;
}

export async function storedSignaturePdf(organizationId: string, documentId: string): Promise<Uint8Array | null> {
  if (!await signatureDatabaseReady()) return null;
  const repository = new PostgresSignatureRepository(db);
  const request = await repository.latest(organizationId, documentId);
  if (!request) return null;
  if (request.status !== "SIGNED") throw new SignatureDeliveryUnavailable(409, "O PDF assinado ainda não está disponível.");
  try {
    const artifact = request.signedArtifactId ? await repository.signedArtifact(organizationId, documentId, request.signedArtifactId) : null;
    const storage = signatureStorage();
    return await readValidatedSignaturePdf(organizationId, { status: request.status, provider: request.provider, artifact }, storage);
  } catch (error) {
    if (error instanceof SignatureDeliveryUnavailable) throw error;
    throw new SignatureDeliveryUnavailable(503, "O armazenamento do PDF assinado está indisponível.");
  }
}
