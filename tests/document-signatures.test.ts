import assert from "node:assert/strict";
import test from "node:test";
import { SignatureService } from "../src/lib/signatures/service";
import { MockSignatureProvider } from "../src/lib/signatures/providers/mock";
import type { SignatureInput, SignatureProvider, SignatureRepository, SignatureRequest, ValidationResult } from "../src/lib/signatures/types";

function setup(options: { simulated?: boolean; validation?: ValidationResult; deny?: boolean; failSignedStorage?: boolean } = {}) {
  const rows = new Map<string, SignatureRequest>();
  const files = new Map<string, Uint8Array>();
  const events: string[] = [];
  let starts = 0;
  const repository: SignatureRepository = {
    async findByKey(org, key) { return [...rows.values()].find(row => row.organizationId === org && row.idempotencyKey === key) ?? null; },
    async find(org, id) { const row = rows.get(id); return row?.organizationId === org ? row : null; },
    async createOrGet(row) {
      const existing = [...rows.values()].find(item => item.organizationId === row.organizationId && item.idempotencyKey === row.idempotencyKey);
      if (existing) return existing;
      rows.set(row.id, row); return row;
    },
    async attachProvider(org, id, providerId) {
      const row = await this.find(org, id);
      if (row?.status !== "PENDING") return false;
      if (row.providerId && row.providerId !== providerId) throw new Error("Provider conflict");
      rows.set(id, { ...row, providerId });
      return true;
    },
    async finish(org, id, status, evidence) {
      const row = await this.find(org, id);
      if (!row || row.status !== "PENDING") return false;
      rows.set(id, { ...row, status }); events.push(evidence.code ?? status); return true;
    },
  };
  const mock = new MockSignatureProvider();
  const provider: SignatureProvider = options.simulated ? mock : {
    name: "test-real-boundary", simulated: false,
    async start() { starts++; return { id: "remote-1" }; },
    async getStatus() { return { status: "COMPLETED", pdf: Buffer.from("signed-pdf-test-fixture") }; },
  };
  const service = new SignatureService({
    repository, provider,
    storage: { async get(org, key) {
      const bytes = files.get(`${org}/${key}`);
      if (!bytes) throw new Error("Not found");
      return Uint8Array.from(bytes);
    }, async put(org, key, bytes) {
      if (options.failSignedStorage && !key.endsWith("/original.pdf")) throw new Error("storage unavailable");
      files.set(`${org}/${key}`, Uint8Array.from(bytes));
    } },
    authorization: { async assertCanSign() { if (options.deny) throw new Error("Forbidden"); } },
    validator: { async validate() { return options.validation ?? { outcome: "valid", qualified: true, signerCpf: "12345678901", certificateFingerprint: "fixture" }; } },
  });
  return { service, rows, files, events, provider, starts: () => starts };
}

const input: SignatureInput = {
  organizationId: "org-a", documentId: "document-a", professionalId: "professional-a",
  userId: "user-a", signerCpf: "12345678901", idempotencyKey: "request-a", pdf: Buffer.from("original-pdf-test-fixture"),
};

test("retries reuse the request and do not call the provider twice", async () => {
  const context = setup();
  const first = await context.service.start(input);
  const second = await context.service.start(input);
  assert.equal(first.id, second.id);
  assert.equal(context.starts(), 1);
});

test("idempotency key rejects altered bytes, document or signer", async () => {
  const { service } = setup();
  await service.start(input);
  for (const changes of [{ pdf: Buffer.from("changed") }, { documentId: "other" }, { signerCpf: "99999999999" }, { userId: "other" }]) {
    await assert.rejects(service.start({ ...input, ...changes }), /idempotente/);
  }
});

test("authorization runs before persistence", async () => {
  const context = setup({ deny: true });
  await assert.rejects(context.service.start(input), /Forbidden/);
  assert.equal(context.rows.size, 0);
  assert.equal(context.files.size, 0);
});

test("authorization is rechecked on retries", async () => {
  const options = { deny: false };
  const context = setup(options);
  await context.service.start(input);
  options.deny = true;
  await assert.rejects(context.service.start(input), /Forbidden/);
  assert.equal(context.starts(), 1);
});

test("storage failure prevents SIGNED", async () => {
  const context = setup({ failSignedStorage: true });
  const request = await context.service.start(input);
  await assert.rejects(context.service.reconcile(input.organizationId, request.id), /unavailable/);
  assert.equal(context.rows.get(request.id)?.status, "PENDING");
  assert.equal(context.files.size, 1);
});

test("cross-tenant lookup is rejected", async () => {
  const { service } = setup();
  const request = await service.start(input);
  await assert.rejects(service.reconcile("org-b", request.id), /não encontrada/);
});

test("mock completion can never mark a document SIGNED", async () => {
  const context = setup({ simulated: true });
  const request = await context.service.start(input);
  await context.service.reconcile(input.organizationId, request.id);
  assert.equal(context.rows.get(request.id)?.status, "FAILED");
  assert.deepEqual(context.events, ["simulation_only"]);
});

test("invalid, unqualified and mismatched signatures fail closed", async () => {
  const results: ValidationResult[] = [
    { outcome: "invalid", code: "tampered" },
    { outcome: "valid", qualified: false, signerCpf: input.signerCpf, certificateFingerprint: "fixture" },
    { outcome: "valid", qualified: true, signerCpf: "99999999999", certificateFingerprint: "fixture" },
  ];
  for (const validation of results) {
    const context = setup({ validation });
    const request = await context.service.start(input);
    await context.service.reconcile(input.organizationId, request.id);
    assert.equal(context.rows.get(request.id)?.status, "FAILED");
    assert.equal(context.files.size, 1);
  }
});

test("unavailable validation remains PENDING", async () => {
  const context = setup({ validation: { outcome: "unavailable" } });
  const request = await context.service.start(input);
  await context.service.reconcile(input.organizationId, request.id);
  assert.equal(context.rows.get(request.id)?.status, "PENDING");
});

test("validated result is stored before SIGNED and reconciliation is terminal", async () => {
  const context = setup();
  const request = await context.service.start(input);
  await context.service.reconcile(input.organizationId, request.id);
  await context.service.reconcile(input.organizationId, request.id);
  assert.equal(context.rows.get(request.id)?.status, "SIGNED");
  assert.equal(context.files.size, 2);
  assert.deepEqual(context.events, ["SIGNED"]);
});

test("provider failure is retryable without replacing the idempotency key", async () => {
  const context = setup();
  const start = context.provider.start;
  context.provider.start = async () => { throw new Error("timeout"); };
  await assert.rejects(context.service.start(input), /timeout/);
  const pending = [...context.rows.values()][0];
  assert.equal(pending.status, "PENDING");
  context.provider.start = start;
  const retried = await context.service.start(input);
  assert.equal(retried.id, pending.id);
});

test("concurrent starts share a request and provider idempotency key", async () => {
  const context = setup({ simulated: true });
  const [first, second] = await Promise.all([context.service.start(input), context.service.start(input)]);
  assert.equal(first.id, second.id);
  assert.equal(first.providerId, second.providerId);
  assert.equal(context.rows.size, 1);
});

test("cancellation is confirmed remotely before the terminal transition", async () => {
  const context = setup();
  const request = await context.service.start(input);
  context.provider.cancel = async () => {};
  context.provider.getStatus = async () => ({ status: "PENDING" });
  await context.service.cancel(input.organizationId, request.id, input.userId);
  assert.equal(context.rows.get(request.id)?.status, "PENDING");
  context.provider.getStatus = async () => ({ status: "CANCELLED" });
  await context.service.cancel(input.organizationId, request.id, input.userId);
  await context.service.reconcile(input.organizationId, request.id);
  assert.equal(context.rows.get(request.id)?.status, "CANCELLED");
  assert.deepEqual(context.events, ["provider_cancelled"]);
});

test("another user cannot cancel a request and unsupported cancellation stays pending", async () => {
  const context = setup();
  const request = await context.service.start(input);
  await assert.rejects(context.service.cancel(input.organizationId, request.id, "other"), /não encontrada/);
  await assert.rejects(context.service.cancel(input.organizationId, request.id, input.userId), /confirmação/);
  assert.equal(context.rows.get(request.id)?.status, "PENDING");
});
