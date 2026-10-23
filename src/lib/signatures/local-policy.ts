import { createHash, timingSafeEqual } from "node:crypto";

export const localEligibleTypes = new Set(["prescription", "exam_request"]);
export const localProviderName = "aggenda-windows-file-v1";
export const bytesHash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

export function assertCeremony(input: { organizationId: string; userId: string; documentId: string; sessionHash: string },
  ceremony: { organizationId: string; userId: string; documentId: string; sessionHash: string; state: string; expiresAt: Date; attempts: number }, now = new Date()) {
  if (ceremony.organizationId !== input.organizationId || ceremony.userId !== input.userId ||
      ceremony.documentId !== input.documentId || ceremony.sessionHash !== input.sessionHash || ceremony.state !== "open" || ceremony.attempts >= 5 ||
      !Number.isFinite(ceremony.expiresAt.getTime()) || ceremony.expiresAt <= now) {
    throw new Error("Autorização expirada, utilizada ou indisponível. Prepare uma nova assinatura.");
  }
}

export function matchesSignatureCode(id: string, code: string, expected: string): boolean {
  const actual = bytesHash(`${id}:${code}`);
  return /^\d{6}$/.test(code) && /^[a-f0-9]{64}$/.test(expected) &&
    timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}
