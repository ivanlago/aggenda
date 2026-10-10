import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { assertSignatureAuthorization, type SignatureAuthorizationFacts } from "../src/lib/signatures/authorization";
import { readValidatedSignaturePdf, SignatureDeliveryUnavailable } from "../src/lib/signatures/delivery";
import { SignatureEncryption } from "../src/lib/signatures/encryption";
import type { SignatureStorage } from "../src/lib/signatures/types";

test("encrypted PDFs round trip and repeated encryption uses distinct nonces", () => {
  const encryption = new SignatureEncryption({ v1: randomBytes(32).toString("base64") }, "v1");
  const pdf = Buffer.from("%PDF-1.7 confidential fixture");
  const first = encryption.encrypt("org-a", "original.pdf", pdf);
  const second = encryption.encrypt("org-a", "original.pdf", pdf);
  assert.notEqual(first, second);
  assert.ok(!first.includes("confidential"));
  assert.deepEqual(Buffer.from(encryption.decrypt("org-a", "original.pdf", first)), pdf);
});

test("encrypted content is bound to both organization and artifact key", () => {
  const encryption = new SignatureEncryption({ v1: randomBytes(32).toString("base64") }, "v1");
  const envelope = encryption.encrypt("org-a", "original.pdf", Buffer.from("fixture"));
  assert.throws(() => encryption.decrypt("org-b", "original.pdf", envelope));
  assert.throws(() => encryption.decrypt("org-a", "different.pdf", envelope));
  const parts = envelope.split(".");
  const ciphertext = Buffer.from(parts[4], "base64");
  ciphertext[0] ^= 1;
  parts[4] = ciphertext.toString("base64");
  assert.throws(() => encryption.decrypt("org-a", "original.pdf", parts.join(".")));
});

test("key rotation preserves old PDFs when old keys remain in the keyring", () => {
  const keys = { old: randomBytes(32).toString("base64"), current: randomBytes(32).toString("base64") };
  const old = new SignatureEncryption(keys, "old");
  const envelope = old.encrypt("org", "pdf", Buffer.from("old pdf"));
  assert.equal(Buffer.from(new SignatureEncryption(keys, "current").decrypt("org", "pdf", envelope)).toString(), "old pdf");
  assert.throws(() => new SignatureEncryption({ current: keys.current }, "current").decrypt("org", "pdf", envelope));
  assert.throws(() => new SignatureEncryption({ bad: "password" }, "bad"));
});

const now = new Date("2026-10-09T12:00:00Z");
const input = { organizationId: "org", userId: "user", professionalId: "professional", documentId: "document", signerCpf: "12345678901", documentHash: "sha256-fixture" };
function facts(): SignatureAuthorizationFacts {
  return { organizationId: "org", userId: "user", role: "professional", professionalUserId: "user",
    professionalActive: true, documentProfessionalId: "professional", documentStatus: "issued",
    documentWorkflow: "professional_issue", documentType: "report",
    evidence: { ...input, cpf: input.signerCpf, authorizedAt: now, expiresAt: new Date(now.getTime() + 60_000) } };
}

test("only the linked professional with bound, recent authorization may sign", () => {
  assert.doesNotThrow(() => assertSignatureAuthorization(input, facts(), new Set(["report"]), now));
  const rejected: Partial<SignatureAuthorizationFacts>[] = [
    { role: "receptionist" }, { role: "manager" }, { professionalUserId: "someone-else" },
    { professionalActive: false }, { organizationId: "other" }, { documentProfessionalId: "other" },
    { documentWorkflow: "patient_signature" }, { documentStatus: "cancelled" }, { evidence: null },
  ];
  for (const changed of rejected) assert.throws(() => assertSignatureAuthorization(input, { ...facts(), ...changed }, new Set(["report"]), now));
  assert.throws(() => assertSignatureAuthorization(input, facts(), new Set(), now));
  // An owner or admin cannot use their administrative role to impersonate a professional.
  assert.throws(() => assertSignatureAuthorization(input, { ...facts(), role: "owner", professionalUserId: "other" }, new Set(["report"]), now));
});

test("authorization evidence rejects replay against a different PDF, CPF or document", () => {
  for (const changed of [
    { documentHash: "changed" }, { cpf: "99999999999" }, { documentId: "other" }, { userId: "other" },
    { expiresAt: now }, { authorizedAt: new Date(now.getTime() - 301_000) },
    { authorizedAt: new Date(now.getTime() + 1) }, { authorizedAt: new Date("invalid") },
  ]) {
    const original = facts();
    assert.throws(() => assertSignatureAuthorization(input, { ...original, evidence: { ...original.evidence!, ...changed } }, new Set(["report"]), now));
  }
});

const signedPdf = Buffer.from("signed PDF fixture");
const artifact = { storageKey: "signed.pdf", sha256: createHash("sha256").update(signedPdf).digest("hex"), sizeBytes: signedPdf.length };
const storage: SignatureStorage = { async put() {}, async get() { return signedPdf; } };

test("delivery returns exactly the stored signed bytes", async () => {
  assert.equal(await readValidatedSignaturePdf("org", { status: "SIGNED", provider: "local_a1", artifact }, storage), signedPdf);
  assert.equal(await readValidatedSignaturePdf("org", null, storage), null);
});

test("a tracked signature never falls back to a regenerated unsigned PDF", async () => {
  for (const status of ["PENDING", "FAILED", "CANCELLED"]) {
    await assert.rejects(readValidatedSignaturePdf("org", { status, provider: "local_a1", artifact }, storage),
      (error: unknown) => error instanceof SignatureDeliveryUnavailable && error.httpStatus === 409);
  }
  await assert.rejects(readValidatedSignaturePdf("org", { status: "SIGNED", provider: "mock", artifact }, storage));
  await assert.rejects(readValidatedSignaturePdf("org", { status: "SIGNED", provider: "local_a1", artifact: null }, storage));
});

test("corrupt or missing stored PDFs fail closed without exposing the storage failure", async () => {
  await assert.rejects(readValidatedSignaturePdf("org", { status: "SIGNED", provider: "local_a1", artifact: { ...artifact, sha256: "changed" } }, storage));
  await assert.rejects(readValidatedSignaturePdf("org", { status: "SIGNED", provider: "local_a1", artifact }, {
    async put() {}, async get() { throw new Error("secret database details"); },
  }), (error: unknown) => error instanceof SignatureDeliveryUnavailable && error.httpStatus === 503 && !error.message.includes("secret"));
});
