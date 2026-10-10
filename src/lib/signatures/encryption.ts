import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Application encryption for PDFs; signing private keys are never stored here. */
export class SignatureEncryption {
  private readonly keys: ReadonlyMap<string, Buffer>;

  constructor(keys: Record<string, string>, private readonly activeKey: string) {
    this.keys = new Map(Object.entries(keys).map(([id, encoded]) => {
      const key = Buffer.from(encoded, "base64");
      if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id) || key.length !== 32 || key.toString("base64") !== encoded) {
        throw new Error("Chave de armazenamento de assinaturas inválida.");
      }
      return [id, key];
    }));
    if (!this.keys.has(activeKey)) throw new Error("Chave ativa de armazenamento não configurada.");
  }

  encrypt(organizationId: string, storageKey: string, bytes: Uint8Array): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.keys.get(this.activeKey)!, iv);
    cipher.setAAD(Buffer.from(JSON.stringify([organizationId, storageKey])));
    const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
    return ["v1", this.activeKey, iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(".");
  }

  decrypt(organizationId: string, storageKey: string, envelope: string): Uint8Array {
    const parts = envelope.split(".");
    const [version, keyId, encodedIv, encodedTag, encodedCiphertext] = parts;
    const key = this.keys.get(keyId);
    if (parts.length !== 5 || version !== "v1" || !key) throw new Error("Arquivo criptografado indisponível.");
    const iv = Buffer.from(encodedIv, "base64");
    const tag = Buffer.from(encodedTag, "base64");
    if (iv.length !== 12 || tag.length !== 16) throw new Error("Arquivo criptografado inválido.");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(JSON.stringify([organizationId, storageKey])));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(encodedCiphertext, "base64")), decipher.final()]);
  }
}
