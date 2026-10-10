import { createHash } from "node:crypto";
import type { SignatureStorage } from "./types";

export class SignatureDeliveryUnavailable extends Error {
  constructor(public readonly httpStatus: number, message: string) { super(message); }
}

export interface SignatureDeliveryRecord {
  status: string;
  provider: string;
  artifact: { storageKey: string; sha256: string; sizeBytes: number } | null;
}

/** Call only after authorizing the document (session or valid patient access token). */
export async function readValidatedSignaturePdf(organizationId: string,
  record: SignatureDeliveryRecord | null, storage: SignatureStorage): Promise<Uint8Array | null> {
  if (!record) return null;
  if (record.status !== "SIGNED") {
    throw new SignatureDeliveryUnavailable(409, "O PDF assinado ainda não está disponível.");
  }
  if (record.provider === "mock" || !record.artifact) {
    throw new SignatureDeliveryUnavailable(503, "Não foi possível verificar o PDF assinado.");
  }
  try {
    const pdf = await storage.get(organizationId, record.artifact.storageKey);
    const actualHash = createHash("sha256").update(pdf).digest("hex");
    if (actualHash !== record.artifact.sha256 || pdf.byteLength !== record.artifact.sizeBytes) {
      throw new Error("Artifact mismatch");
    }
    return pdf;
  } catch {
    throw new SignatureDeliveryUnavailable(503, "Não foi possível recuperar o PDF assinado com integridade.");
  }
}
