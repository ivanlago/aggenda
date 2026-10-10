import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { db } from "../src/db";
import * as schema from "../src/db/schema";
import { SignatureEncryption } from "../src/lib/signatures/encryption";
import { PostgresSignatureRepository } from "../src/lib/signatures/postgres-repository";
import { PostgresSignatureStorage } from "../src/lib/signatures/postgres-storage";
import type { SignatureRequest } from "../src/lib/signatures/types";

test("signature persistence against an isolated PostgreSQL engine", async (t) => {
  const client = new PGlite();
  try {
    // Minimal existing application tables; the actual new migration SQL runs unchanged.
    await client.exec(`
      CREATE TABLE organizations (id uuid PRIMARY KEY);
      CREATE TABLE users (id text PRIMARY KEY);
      CREATE TABLE professionals (id uuid PRIMARY KEY, organization_id uuid NOT NULL);
      CREATE TABLE electronic_documents (id uuid PRIMARY KEY, organization_id uuid NOT NULL, status text NOT NULL);
    `);
    for (const file of ["0066_powerful_butterfly.sql", "0067_tearful_tiger_shark.sql"]) {
      await client.exec(await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8"));
    }
    // Both drivers expose the same Drizzle PostgreSQL query/transaction operations
    // used by these adapters. Production continues to use node-postgres.
    const database = drizzle(client, { schema }) as unknown as typeof db;
    const repository = new PostgresSignatureRepository(database);
    const storage = new PostgresSignatureStorage(database,
      new SignatureEncryption({ v1: randomBytes(32).toString("base64") }, "v1"));
    const organizationId = randomUUID();
    const otherOrganization = randomUUID();
    const professionalId = randomUUID();
    await client.query("INSERT INTO organizations VALUES ($1), ($2)", [organizationId, otherOrganization]);
    await client.query("INSERT INTO users VALUES ('user')");
    await client.query("INSERT INTO professionals VALUES ($1, $2)", [professionalId, organizationId]);

    async function newRequest(): Promise<SignatureRequest> {
      const documentId = randomUUID();
      const id = randomUUID();
      const pdf = Buffer.from("%PDF original test fixture");
      await client.query("INSERT INTO electronic_documents VALUES ($1, $2, 'issued')", [documentId, organizationId]);
      const originalKey = `signatures/${id}/original.pdf`;
      await storage.put(organizationId, originalKey, pdf);
      return { id, organizationId, documentId, professionalId, userId: "user", signerCpf: "12345678901",
        idempotencyKey: randomUUID(), originalKey, inputHash: createHash("sha256").update(pdf).digest("hex"),
        sizeBytes: pdf.length, provider: "test-fixture", providerId: null, status: "PENDING" };
    }

    await t.test("encrypted private storage is immutable and tenant scoped", async () => {
      const pdf = Buffer.from("%PDF confidential test fixture");
      await storage.put(organizationId, "test-storage", pdf);
      await storage.put(organizationId, "test-storage", pdf);
      assert.deepEqual(Buffer.from(await storage.get(organizationId, "test-storage")), pdf);
      await assert.rejects(storage.put(organizationId, "test-storage", Buffer.from("overwrite")), /substituir/);
      await assert.rejects(storage.get(otherOrganization, "test-storage"), /não encontrado/);
      const result = await client.query<{ encrypted_content: string }>(
        "SELECT encrypted_content FROM document_signature_blobs WHERE storage_key = 'test-storage'");
      assert.ok(!result.rows[0].encrypted_content.includes("confidential"));
    });

    await t.test("idempotent creation persists original metadata and one audit event", async () => {
      const request = await newRequest();
      const created = await repository.createOrGet(request);
      const repeated = await repository.createOrGet({ ...request, id: randomUUID() });
      assert.equal(repeated.id, created.id);
      assert.deepEqual(await repository.find(organizationId, request.id), request);
      assert.equal(await repository.find(otherOrganization, request.id), null);
      const events = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM document_signature_events WHERE request_id = $1", [request.id]);
      assert.equal(events.rows[0].count, 1);
      await assert.rejects(repository.createOrGet({ ...request, id: randomUUID(), idempotencyKey: randomUUID() }), /em andamento/);
    });

    await t.test("provider attachment is idempotent and detects divergent provider IDs", async () => {
      const request = await repository.createOrGet(await newRequest());
      assert.equal(await repository.attachProvider(organizationId, request.id, "remote-a"), true);
      assert.equal(await repository.attachProvider(organizationId, request.id, "remote-a"), true);
      await assert.rejects(repository.attachProvider(organizationId, request.id, "remote-b"), /divergentes/);
      const events = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM document_signature_events WHERE request_id = $1 AND event_type = 'provider_attached'", [request.id]);
      assert.equal(events.rows[0].count, 1);
    });

    await t.test("completion commits signed artifact and audit atomically, without terminal regression", async () => {
      const request = await repository.createOrGet(await newRequest());
      await assert.rejects(repository.finish(organizationId, request.id, "SIGNED", {}), /incompletas/);
      assert.equal((await repository.find(organizationId, request.id))?.status, "PENDING");
      const signed = Buffer.from("%PDF signed test fixture");
      const signedHash = createHash("sha256").update(signed).digest("hex");
      const signedKey = `signatures/${request.id}/${signedHash}.pdf`;
      await storage.put(organizationId, signedKey, signed);
      assert.equal(await repository.finish(organizationId, request.id, "SIGNED", {
        signedKey, signedHash, signedSizeBytes: signed.length, certificateFingerprint: "test-fixture",
      }), true);
      assert.equal(await repository.finish(organizationId, request.id, "FAILED", { code: "late_event" }), false);
      const latest = await repository.latest(organizationId, request.documentId);
      assert.equal(latest?.status, "SIGNED");
      assert.ok(latest?.validatedAt);
      const artifact = await repository.signedArtifact(organizationId, request.documentId, latest!.signedArtifactId!);
      assert.equal(artifact?.sha256, signedHash);
      assert.equal(await repository.signedArtifact(otherOrganization, request.documentId, latest!.signedArtifactId!), null);
    });

    await t.test("foreign keys reject linking another organization's document or professional", async () => {
      const request = await newRequest();
      await assert.rejects(client.query(
        "INSERT INTO document_artifacts (organization_id, document_id, kind, storage_key, sha256, size_bytes) VALUES ($1,$2,'original','cross-tenant',$3,1)",
        [otherOrganization, request.documentId, request.inputHash]));
      const anotherProfessional = randomUUID();
      await client.query("INSERT INTO professionals VALUES ($1, $2)", [anotherProfessional, otherOrganization]);
      await assert.rejects(repository.createOrGet({ ...request, professionalId: anotherProfessional }));
      assert.equal(await repository.find(organizationId, request.id), null);
    });

    await t.test("database constraints reject a mock signature even through direct SQL", async () => {
      const request = await repository.createOrGet({ ...await newRequest(), provider: "mock" });
      await assert.rejects(repository.finish(organizationId, request.id, "SIGNED", {
        signedKey: "fake", signedHash: "a".repeat(64), signedSizeBytes: 1, certificateFingerprint: "fake",
      }));
      await assert.rejects(client.query(
        "UPDATE document_signature_requests SET status = 'SIGNED', signed_artifact_id = original_artifact_id, validated_at = now(), certificate_fingerprint = 'fake' WHERE id = $1", [request.id]));
      assert.equal(await repository.finish(organizationId, request.id, "FAILED", { code: "simulation_only" }), true);
    });
  } finally {
    await client.close();
  }
});
