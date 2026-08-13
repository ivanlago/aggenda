import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key() {
  const secret = process.env.FINANCIAL_INTEGRATION_SECRET || process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("Configure FINANCIAL_INTEGRATION_SECRET para armazenar credenciais financeiras.");
  return createHash("sha256").update(secret).digest();
}

export function encryptFinancialCredential(value: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(), iv); const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]); const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((item) => item.toString("base64url")).join(".");
}

export function decryptFinancialCredential(value: string) {
  const [iv, tag, encrypted] = value.split("."); if (!iv || !tag || !encrypted) throw new Error("Credencial financeira inválida."); const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url")); decipher.setAuthTag(Buffer.from(tag, "base64url")); return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
