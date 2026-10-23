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
import { rotateSignatureStorage } from "../src/lib/signatures/rotate-storage";

test("signature persistence against an isolated PostgreSQL engine", async (t) => {
  const client = new PGlite();
  try {
    // Minimal existing application tables; the actual new migration SQL runs unchanged.
    await client.exec(`
      CREATE TABLE organizations (id uuid PRIMARY KEY);
      CREATE TABLE users (id text PRIMARY KEY);
      CREATE TABLE professionals (id uuid PRIMARY KEY, organization_id uuid NOT NULL);
      CREATE TABLE electronic_documents (id uuid PRIMARY KEY, organization_id uuid NOT NULL, status text NOT NULL);
      CREATE TABLE audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,
        user_id text, action text NOT NULL, entity_type text NOT NULL, entity_id text, details jsonb DEFAULT '{}', created_at timestamp DEFAULT now());
    `);
    for (const file of ["0066_powerful_butterfly.sql", "0067_tearful_tiger_shark.sql", "0082_professional_signing.sql", "0083_signing_processing_lease.sql", "0084_signing_session_binding.sql"]) {
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
        sizeBytes: pdf.length, provider: "test-fixture", method: "cloud", providerId: null, status: "PENDING" };
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

    await t.test("local signing method survives persistence and never defaults to cloud", async () => {
      const request = await repository.createOrGet({ ...await newRequest(), method: "local_a1" });
      assert.equal((await repository.find(organizationId, request.id))?.method, "local_a1");
    });

    await t.test("rotation verifies all bytes, preserves signed PDFs and isolates tenants", async () => {
      const keyring = { old: randomBytes(32).toString("base64"), next: randomBytes(32).toString("base64") };
      const old = new SignatureEncryption(keyring, "old"); const next = new SignatureEncryption(keyring, "next");
      const org = randomUUID(); const other = randomUUID();
      await client.query("INSERT INTO organizations VALUES ($1), ($2)", [org, other]);
      const original = Buffer.from("%PDF bytes with immutable signature fixture");
      const originalEnvelope = old.encrypt(org, "one", original);
      await client.query("INSERT INTO document_signature_blobs (organization_id, storage_key, encrypted_content) VALUES ($1,'one',$2),($3,'one',$4)",
        [org, originalEnvelope, other, old.encrypt(other, "one", original)]);
      assert.equal((await rotateSignatureStorage(database, org, next)).rotated, 1);
      const read = async (id: string) => (await client.query<{ encrypted_content: string }>(
        "SELECT encrypted_content FROM document_signature_blobs WHERE organization_id=$1 AND storage_key='one'", [id])).rows[0].encrypted_content;
      assert.equal(await read(org), originalEnvelope);
      assert.equal((await rotateSignatureStorage(database, org, next, true)).rotated, 1);
      assert.deepEqual(Buffer.from(next.decrypt(org, "one", await read(org))), original);
      assert.ok((await read(other)).startsWith("v1.old."));
      assert.equal((await rotateSignatureStorage(database, org, next, true)).rotated, 0);
      // The old backup stays readable while its key is retained.
      assert.deepEqual(Buffer.from(next.decrypt(org, "one", originalEnvelope)), original);
      await client.query("UPDATE document_signature_blobs SET encrypted_content=$1 WHERE organization_id=$2", [originalEnvelope, org]);
      await client.query("INSERT INTO document_signature_blobs (organization_id,storage_key,encrypted_content) VALUES ($1,'broken','corrupt')", [org]);
      await assert.rejects(rotateSignatureStorage(database, org, next, true));
      assert.equal(await read(org), originalEnvelope);
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
      await assert.rejects(repository.createOrGet({ ...request, id: randomUUID(), idempotencyKey: randomUUID() }), /concluída/);
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

    await t.test("local ceremonies preserve tenant FKs and claim an authorization only once", async () => {
      const request = await newRequest();
      const id = randomUUID();
      await client.query("INSERT INTO professional_signing_identities (organization_id,professional_id,cpf,verified_by) VALUES ($1,$2,'52998224725','user')", [organizationId, professionalId]);
      await assert.rejects(client.query("INSERT INTO professional_signing_identities (organization_id,professional_id,cpf,verified_by) VALUES ($1,$2,'52998224725','user')", [otherOrganization, professionalId]));
      await client.query(`INSERT INTO professional_signing_ceremonies (id,organization_id,document_id,professional_id,user_id,session_hash,signer_cpf,original_key,original_hash,otp_hash,expires_at)
        VALUES ($1,$2,$3,$4,'user','test-session','52998224725','prepared',$5,$5,now()+interval '20 minutes')`, [id, organizationId, request.documentId, professionalId, request.inputHash]);
      const claim = () => client.query("UPDATE professional_signing_ceremonies SET state='processing',processing_started_at=now() WHERE id=$1 AND state='open' RETURNING id", [id]);
      const results = await Promise.all([claim(), claim()]);
      assert.equal(results.reduce((sum, result) => sum + result.rows.length, 0), 1);
      await assert.rejects(client.query("UPDATE professional_signing_ceremonies SET state='SIGNED' WHERE id=$1", [id]));
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
