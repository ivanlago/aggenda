import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { db } from "../src/db";
import { nfseMunicipalityReference } from "../src/lib/nfse/municipalities";
import { nfseOnboardingSchema, readNfseOnboarding, storeNfseOnboarding } from "../src/lib/nfse/onboarding";

test("regional references distinguish Salvador municipal, national transition and Lauro's updated reference without enabling issuance", () => {
  const salvador = nfseMunicipalityReference("2927408", "lucro_presumido")!;
  assert.equal(salvador.provider, "Próprio");
  assert.equal(salvador.suggestedChannel, "municipal");
  assert.match(salvador.cancellation, /indisponível no webservice/);
  assert.equal(nfseMunicipalityReference("2927408", "mei")!.suggestedChannel, "national");
  assert.equal(nfseMunicipalityReference("2927408", "simples_nacional")!.suggestedChannel, "national");
  const lauro = nfseMunicipalityReference("2919207", "lucro_presumido")!;
  assert.equal(lauro.suggestedChannel, "national");
  assert.equal(lauro.automaticIssuanceAvailable, false);
  assert.equal(salvador.automaticIssuanceAvailable, false);
  assert.equal(nfseMunicipalityReference("0000000", "lucro_presumido"), null);
  assert.equal(nfseOnboardingSchema.safeParse({ cnpj: "123", municipalityCode: "2927408", taxRegime: "lucro_presumido" }).success, false);
  assert.equal(nfseOnboardingSchema.safeParse({ cnpj: "12345678000190", municipalityCode: "0000000", taxRegime: "lucro_presumido" }).success, false);
  assert.equal(readNfseOnboarding({ fiscalOnboarding: { municipalityCode: "2919207" } }), null);
});

test("Postgres preparation is tenant scoped, persists without A1 and preserves certificate, consent, route and environment", async () => {
  const client = new PGlite();
  try {
    await client.exec(`CREATE TABLE organization_financial_integrations(is_default_pos boolean NOT NULL DEFAULT false, id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, provider text NOT NULL, environment text NOT NULL, status text NOT NULL, encrypted_credential text NOT NULL, metadata jsonb, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(), UNIQUE(organization_id,provider));`);
    const database = drizzle(client) as unknown as typeof db;
    const first = randomUUID(), second = randomUUID();
    const input = nfseOnboardingSchema.parse({ cnpj: "12.345.678/0001-90", municipalityCode: "2927408", taxRegime: "lucro_presumido" });
    await storeNfseOnboarding(database, first, "operator", input, "encrypted-placeholder");
    let result = await client.query<{ metadata: Record<string, unknown>; status: string; environment: string; encrypted_credential: string }>("SELECT * FROM organization_financial_integrations WHERE organization_id=$1", [first]);
    assert.equal(result.rows[0].status, "requested");
    assert.equal(result.rows[0].environment, "sandbox");
    assert.equal(readNfseOnboarding(result.rows[0].metadata)?.cnpj, "12345678000190");
    const original = { fiscalProfile: { routingMode: "government" }, certificateConsent: { revokedAt: "2026-10-26" }, retained: "evidence" };
    await client.query("INSERT INTO organization_financial_integrations(organization_id,provider,environment,status,encrypted_credential,metadata) VALUES ($1,'nfse','production','revoked','actual-ciphertext',$2)", [second, JSON.stringify(original)]);
    await storeNfseOnboarding(database, second, "other-operator", { ...input, municipalityCode: "2919207" }, "must-not-replace");
    result = await client.query("SELECT * FROM organization_financial_integrations WHERE organization_id=$1", [second]);
    assert.equal(result.rows[0].encrypted_credential, "actual-ciphertext");
    assert.equal(result.rows[0].environment, "production");
    assert.equal(result.rows[0].status, "revoked");
    assert.deepEqual(result.rows[0].metadata.fiscalProfile, original.fiscalProfile);
    assert.deepEqual(result.rows[0].metadata.certificateConsent, original.certificateConsent);
    assert.equal(result.rows[0].metadata.retained, "evidence");
    assert.equal(readNfseOnboarding(result.rows[0].metadata)?.municipalityCode, "2919207");
    const unchanged = await client.query<{ metadata: Record<string, unknown> }>("SELECT metadata FROM organization_financial_integrations WHERE organization_id=$1", [first]);
    assert.equal(readNfseOnboarding(unchanged.rows[0].metadata)?.municipalityCode, "2927408");
  } finally { await client.close(); }
});
