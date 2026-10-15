import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { db } from "../src/db";
import * as schema from "../src/db/schema";
import { encryptFinancialCredential } from "../src/lib/financial-secret";
import { migrateNfseCustody } from "../src/lib/nfse/custody-migration";
import { NfseVault, openNfseCertificate, readStoredNfseValue } from "../src/lib/nfse/vault";
import { definitiveFiscalRejection } from "../src/lib/nfse/government";
import JSZip from "jszip";
import { fiscalArchive } from "../src/lib/nfse/archive";

test("fiscal archive preserves original XMLs, cancellation and status without credentials", async () => {
  const id = randomUUID();
  const zip = await JSZip.loadAsync(await fiscalArchive([{ id, status: "cancelled", xml: "<NFSe>original</NFSe>", eventXml: "<evento>cancelamento</evento>" }]));
  assert.equal(await zip.file(`notas/${id}.xml`)!.async("string"), "<NFSe>original</NFSe>");
  assert.equal(await zip.file(`eventos/${id}-cancelamento.xml`)!.async("string"), "<evento>cancelamento</evento>");
  assert.deepEqual(JSON.parse(await zip.file("manifesto.json")!.async("string")).documents, [{ id, status: "cancelled" }]);
  assert.equal(Object.keys(zip.files).some((name) => /credential|certificate|draft/i.test(name)), false);
  await assert.rejects(() => fiscalArchive([]), /1 a 500/);
  await assert.rejects(() => fiscalArchive([{ id: "../private", status: "authorized", xml: "x" }]), /inválido/);
  await assert.rejects(() => fiscalArchive([{ id, status: "uncertain", xml: "x" }]), /inválido/);
  await assert.rejects(() => fiscalArchive([{ id, status: "authorized", xml: "x".repeat(25 * 1024 * 1024 + 1) }]), /25 MB/);
});

test("fiscal custody: tenant/object binding, tampering, rotation and legacy restrictions", () => {
  const keys = { old: randomBytes(32).toString("base64"), next: randomBytes(32).toString("base64") };
  const old = new NfseVault(keys, "old"); const next = new NfseVault(keys, "next");
  const envelope = old.encrypt("clinic-a", "certificate", "private-fixture");
  assert.equal(next.decrypt("clinic-a", "certificate", envelope), "private-fixture");
  assert.throws(() => next.decrypt("clinic-b", "certificate", envelope), /Integridade/);
  assert.throws(() => next.decrypt("clinic-a", "request/xml", envelope), /Integridade/);
  const parts = envelope.split("."); parts[3] = randomBytes(16).toString("base64url");
  assert.throws(() => next.decrypt("clinic-a", "certificate", parts.join(".")), /Integridade/);
  assert.throws(() => new NfseVault({ next: keys.next }, "next").decrypt("clinic-a", "certificate", envelope), /indisponível/);
  assert.equal(next.decrypt("clinic-a", "certificate", next.rotate("clinic-a", "certificate", envelope)), "private-fixture");
  assert.throws(() => new NfseVault({ bad: "short" }, "bad"), /inválida/);
  process.env.FINANCIAL_INTEGRATION_SECRET = "synthetic-legacy-key";
  const legacy = encryptFinancialCredential("historical-document");
  assert.equal(readStoredNfseValue("clinic-a", "request/xml", legacy), "historical-document");
  assert.throws(() => openNfseCertificate("clinic-a", legacy), /Atualize ou migre/);
});

test("only verified pre-authorization errors allow a new corrected attempt", () => {
  const dps = "DPS" + "1".repeat(42);
  const result = (code: string, id = dps) => ({ status: 400, body: { idDPS: id, erros: [{ Codigo: code }] } });
  assert.ok(definitiveFiscalRejection(result("E0010"), dps));
  assert.equal(definitiveFiscalRejection(result("E999"), dps), null);
  assert.equal(definitiveFiscalRejection(result("E0010", "wrong-id"), dps), null);
  assert.equal(definitiveFiscalRejection({ ...result("E0010"), status: 500 }, dps), null);
  assert.equal(definitiveFiscalRejection({ status: 400, body: { ...result("E0010").body, chaveAcesso: "1".repeat(50) } }, dps), null);
});

test("custody migration: dry run, rotation, tenant isolation, rollback and key recovery", async () => {
  process.env.FINANCIAL_INTEGRATION_SECRET = "synthetic-legacy-key";
  const vault = new NfseVault({ current: randomBytes(32).toString("base64") }, "current");
  const client = new PGlite();
  try {
    await client.exec(`CREATE TABLE organizations(id uuid PRIMARY KEY); CREATE TABLE financial_entries(id uuid PRIMARY KEY); CREATE TABLE organization_financial_integrations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,provider text NOT NULL,environment text NOT NULL,encrypted_credential text NOT NULL,status text NOT NULL,metadata jsonb,created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now()); CREATE TABLE audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,user_id text,action text NOT NULL,entity_type text NOT NULL,entity_id text,details jsonb,created_at timestamp DEFAULT now());`);
    for (const file of ["0068_nfse_requests.sql", "0069_nfse_custody_events.sql", "0070_nfse_rejected_attempts.sql"]) await client.exec(await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8"));
    const database = drizzle(client, { schema }) as unknown as typeof db;
    const org = randomUUID(); const other = randomUUID(); const entry = randomUUID();
    await client.query("INSERT INTO organizations VALUES ($1),($2)", [org, other]);
    await client.query("INSERT INTO financial_entries VALUES ($1)", [entry]);
    const legacy = encryptFinancialCredential("private synthetic certificate");
    await client.query("INSERT INTO organization_financial_integrations(organization_id,provider,environment,encrypted_credential,status) VALUES ($1,'nfse','sandbox',$3,'configured'),($2,'nfse','sandbox',$3,'configured')", [org, other, legacy]);
    const [row] = await database.insert(schema.nfseRequests).values({ organizationId: org, financialEntryId: entry, environment: "sandbox", cnpj: "11222333000181", dpsId: randomUUID(), amountInCents: 100, encryptedDraft: encryptFinancialCredential("synthetic draft") }).returning();
    assert.equal((await migrateNfseCustody(database, org, vault)).mode, "dry_run");
    let credentials = await client.query<{ encrypted_credential: string }>("SELECT encrypted_credential FROM organization_financial_integrations WHERE organization_id=$1", [org]);
    assert.equal(credentials.rows[0].encrypted_credential, legacy);
    await migrateNfseCustody(database, org, vault, true);
    credentials = await client.query("SELECT encrypted_credential FROM organization_financial_integrations WHERE organization_id=$1", [org]);
    assert.equal(vault.decrypt(org, "certificate", credentials.rows[0].encrypted_credential), "private synthetic certificate");
    const untouched = await client.query<{ encrypted_credential: string }>("SELECT encrypted_credential FROM organization_financial_integrations WHERE organization_id=$1", [other]);
    assert.equal(untouched.rows[0].encrypted_credential, legacy);
    const first = await client.query<{ encrypted_draft: string }>("SELECT encrypted_draft FROM nfse_requests WHERE id=$1", [row.id]);
    const preservedBackup = first.rows[0].encrypted_draft;
    assert.equal(vault.decrypt(org, `${row.id}/draft`, preservedBackup), "synthetic draft");
    assert.equal((await migrateNfseCustody(database, org, vault, true)).artifacts, 0);
    const next = new NfseVault({ current: randomBytes(32).toString("base64") }, "current");
    // A missing or replaced key fails before committing any data.
    await assert.rejects(migrateNfseCustody(database, org, next, true));
    assert.equal(vault.decrypt(org, `${row.id}/draft`, preservedBackup), "synthetic draft");
    const final = await client.query<{ encrypted_draft: string }>("SELECT encrypted_draft FROM nfse_requests WHERE id=$1", [row.id]);
    assert.equal(final.rows[0].encrypted_draft, preservedBackup);
  } finally { await client.close(); }
});
