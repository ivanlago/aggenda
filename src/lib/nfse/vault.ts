import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { decryptFinancialCredential } from "../financial-secret";

const version = "nfse1";
export const isNfseEnvelope = (value: string) => value.startsWith(`${version}.`);

/** Dedicated, versioned encryption. AAD binds ciphertext to tenant, object and key id. */
export class NfseVault {
  private readonly keys: ReadonlyMap<string, Buffer>;
  constructor(keys: Record<string, string>, readonly activeKey: string) {
    this.keys = new Map(Object.entries(keys).map(([id, encoded]) => {
      const bytes = Buffer.from(encoded, "base64");
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || bytes.length !== 32 || bytes.toString("base64") !== encoded) throw new Error("Chave fiscal inválida. Use 32 bytes aleatórios em Base64.");
      return [id, bytes];
    }));
    if (!this.keys.has(activeKey)) throw new Error("Configure a chave fiscal ativa antes de usar certificados.");
  }
  encrypt(organizationId: string, slot: string, text: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.keys.get(this.activeKey)!, iv);
    cipher.setAAD(Buffer.from(JSON.stringify([version, this.activeKey, organizationId, slot])));
    const bytes = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    return [version, this.activeKey, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), bytes.toString("base64url")].join(".");
  }
  decrypt(organizationId: string, slot: string, envelope: string) {
    const [v, id, encodedIv, encodedTag, encrypted, ...extra] = envelope.split(".");
    const key = this.keys.get(id);
    if (v !== version || !key || !encodedIv || !encodedTag || !encrypted || extra.length) throw new Error("Conteúdo fiscal indisponível. Confira as chaves preservadas.");
    try {
      const iv = Buffer.from(encodedIv, "base64url"); const tag = Buffer.from(encodedTag, "base64url");
      if (iv.length !== 12 || tag.length !== 16) throw new Error();
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAAD(Buffer.from(JSON.stringify([version, id, organizationId, slot])));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
    } catch { throw new Error("Integridade do conteúdo fiscal não confirmada."); }
  }
  rotate(organizationId: string, slot: string, envelope: string) {
    return this.encrypt(organizationId, slot, this.decrypt(organizationId, slot, envelope));
  }
}

export function nfseVault() {
  let keys: Record<string, string>;
  try {
    const parsed: unknown = JSON.parse(process.env.NFSE_STORAGE_KEYS ?? "");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.values(parsed).some((v) => typeof v !== "string")) throw new Error();
    keys = parsed as Record<string, string>;
  } catch { throw new Error("Configure NFSE_STORAGE_KEYS e NFSE_STORAGE_ACTIVE_KEY para a custódia fiscal."); }
  return new NfseVault(keys, process.env.NFSE_STORAGE_ACTIVE_KEY ?? "");
}

/** Historical documents remain readable during migration. New signatures forbid legacy A1. */
export function readStoredNfseValue(organizationId: string, slot: string, envelope: string) {
  return isNfseEnvelope(envelope) ? nfseVault().decrypt(organizationId, slot, envelope) : decryptFinancialCredential(envelope);
}

export function openNfseCertificate(organizationId: string, envelope: string) {
  if (!isNfseEnvelope(envelope)) throw new Error("Atualize ou migre o certificado para a custódia fiscal dedicada antes de emitir.");
  return nfseVault().decrypt(organizationId, "certificate", envelope);
}
