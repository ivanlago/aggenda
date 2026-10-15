import { db } from "@/db";
import { SignatureEncryption } from "./encryption";
import { PostgresSignatureStorage } from "./postgres-storage";

export function signatureEncryption() {
  const keys: unknown = JSON.parse(process.env.SIGNATURE_STORAGE_KEYS || "{}");
  if (!keys || typeof keys !== "object" || Array.isArray(keys) || Object.values(keys).some(value => typeof value !== "string")) {
    throw new Error("Chaves de armazenamento de assinaturas inválidas.");
  }
  return new SignatureEncryption(keys as Record<string, string>, process.env.SIGNATURE_STORAGE_ACTIVE_KEY || "v1");
}

export function signatureStorage() {
  return new PostgresSignatureStorage(db, signatureEncryption());
}
