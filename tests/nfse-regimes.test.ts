import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, writeFile, readFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import forge from "node-forge";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { db } from "../src/db";
import type { NfseFiscalProfile } from "../src/lib/nfse-routing";
import { readNfseProfile } from "../src/lib/nfse-routing";
import { NfseService } from "../src/lib/nfse/service";
import { NfseVault } from "../src/lib/nfse/vault";
import { buildDps, normalizeFiscalDraft, signFiscalXml, type FiscalDraft } from "../src/lib/nfse/xml";
import { fiscalChannelFor, nationalTaxXml, readNationalTaxForm, type FiscalRegime, type NationalTax } from "../src/lib/nfse/tax-regimes";
import { buildSalvadorBatch, signSalvadorBatch, type SalvadorDraft } from "../src/lib/nfse/salvador/xml";

const regimes: FiscalRegime[] = ["mei", "simples_nacional", "lucro_presumido", "lucro_real"];
const profile: NfseFiscalProfile = { cnpj: "11222333000181", municipalRegistration: "123456", municipalityCode: "2919207", taxRegime: "lucro_presumido", routingMode: "pending_analysis", compatibilityStatus: "not_checked", partnerFallbackAuthorized: false };
const base = { payerDocument: "52998224725", payerName: "Pessoa teste", description: "Serviço de teste & revisão", serviceCode: "040101", nbs: "123456789", competence: "2026-10-27", amountInCents: 25000, address: { street: "Rua Teste", number: "10", district: "Centro", municipalityCode: "2919207", zip: "42700000" } };
const ibs = { cst: "000" as const, classification: "000001", operationIndicator: "100301", finalConsumer: "1" as const };
function tax(regime: FiscalRegime): NationalTax {
  const scenario = "local_tributavel_sem_retencoes" as const;
  if (regime === "mei") return { regime, scenario };
  if (regime === "simples_nacional") return { regime, scenario, assessment: "1", simpleRateBasisPoints: 600 };
  return { regime, scenario, pisCofins: { cst: "01", baseInCents: 25000, pisRateBasisPoints: regime === "lucro_real" ? 165 : 65, cofinsRateBasisPoints: regime === "lucro_real" ? 760 : 300 }, approximate: { federalBasisPoints: 1000, stateBasisPoints: 0, municipalBasisPoints: 500 } };
}
const input = (regime: FiscalRegime): FiscalDraft => ({ ...base, tax: tax(regime), ibsCbs: ibs });
const municipal: SalvadorDraft = { channel: "salvador", rpsNumber: "100", rpsSeries: "AG1", issuedAt: "2026-10-27T10:00:00-03:00", payerDocument: base.payerDocument, payerName: base.payerName, address: { ...base.address, state: "BA" }, description: base.description, itemList: "04.01", cnae: "8630503", nbs: base.nbs, taxClassification: "000001", operationIndicator: "100301", amountInCents: 25000, issRateBasisPoints: 500, scenario: "local_tributavel_sem_retencoes", taxRegime: "lucro_presumido" };

test("four national regimes use correct option, assessment, totalization and explicit federal taxation", () => {
  for (const regime of regimes) {
    const built = buildDps({ ...profile, taxRegime: regime }, "sandbox", "1", "1", input(regime));
    assert.match(built.xml, new RegExp(`<opSimpNac>${regime === "mei" ? 2 : regime === "simples_nacional" ? 3 : 1}</opSimpNac>`));
    if (regime === "mei") { assert.doesNotMatch(built.xml, /<IM>|regApTribSN|pTotTribSN|tribFed|pAliq/); assert.match(built.xml, /<indTotTrib>0<\/indTotTrib>/); }
    if (regime === "simples_nacional") { assert.match(built.xml, /<regApTribSN>1<\/regApTribSN>/); assert.match(built.xml, /<pTotTribSN>6.00<\/pTotTribSN>/); assert.doesNotMatch(built.xml, /tribFed/); }
    if (regime === "lucro_presumido" || regime === "lucro_real") { assert.doesNotMatch(built.xml, /regApTribSN|pTotTribSN|indTotTrib|<pAliq>/); assert.match(built.xml, /<pTotTribFed>10.00<\/pTotTribFed>/); assert.match(built.xml, /<tpRetPisCofins>2<\/tpRetPisCofins>/); }
  }
  assert.match(buildDps(profile, "sandbox", "1", "1", input("lucro_presumido")).xml, /<vPis>1.63<\/vPis>/);
  assert.match(buildDps({ ...profile, taxRegime: "lucro_real" }, "sandbox", "1", "1", input("lucro_real")).xml, /<vPis>4.13<\/vPis>/);
  const zero: NationalTax = { regime: "lucro_real", scenario: "local_tributavel_sem_retencoes", pisCofins: { cst: "06" }, approximate: { federalBasisPoints: 0, stateBasisPoints: 0, municipalBasisPoints: 0 } };
  assert.doesNotMatch(nationalTaxXml(zero, 25000).values, /vBCPisCofins|pAliqPis|vPis/);
});

test("missing fiscal inputs, invalid combinations and reclassification cannot silently change a draft", () => {
  assert.throws(() => buildDps(profile, "sandbox", "1", "1", { ...base, totalTaxPercent: 6 }), /específicos/);
  assert.throws(() => buildDps(profile, "sandbox", "1", "1", input("lucro_real")), /regime/);
  assert.throws(() => buildDps(profile, "sandbox", "1", "1", { ...input("lucro_presumido"), address: undefined }), /endereço/);
  assert.throws(() => buildDps(profile, "sandbox", "1", "1", { ...input("lucro_presumido"), ibsCbs: undefined }), /IBS/);
  assert.throws(() => buildDps(profile, "sandbox", "1", "1", { ...input("lucro_presumido"), competence: "2025-12-31" }), /2026/);
  assert.throws(() => buildDps(profile, "sandbox", "1", "1", { ...input("lucro_presumido"), retainedIss: true } as FiscalDraft));
  const regularTax = tax("lucro_presumido");
  if ("pisCofins" in regularTax) assert.throws(() => nationalTaxXml({ ...regularTax, pisCofins: { cst: "01", baseInCents: 25001, pisRateBasisPoints: 65, cofinsRateBasisPoints: 300 } }, 25000), /base/);
  const saved = normalizeFiscalDraft(profile, input("lucro_presumido"));
  assert.throws(() => buildDps({ ...profile, municipalRegistration: "9999" }, "sandbox", "1", "1", saved), /cadastro/);
  const form = new FormData();
  assert.throws(() => readNationalTaxForm(form, "lucro_real"));
  form.set("snAssessment", "2"); form.set("simpleRate", "6");
  assert.throws(() => readNationalTaxForm(form, "simples_nacional"));
  form.set("pisCofinsCst", "06"); form.set("pisRate", "0");
  assert.throws(() => readNationalTaxForm(form, "lucro_real"), /em branco/);
  assert.ok(readNfseProfile({ fiscalProfile: { ...profile, taxRegime: "mei", municipalRegistration: "" } }));
});

test("Salvador routing covers four regimes and municipal RPS preserves Presumido/Real identity", () => {
  for (const regime of regimes) {
    assert.equal(fiscalChannelFor("2919207", regime), "national");
    assert.equal(fiscalChannelFor("2927408", regime), regime === "mei" || regime === "simples_nacional" ? "national" : "salvador");
  }
  for (const regime of ["lucro_presumido", "lucro_real"] as const) {
    const xml = buildSalvadorBatch({ ...profile, municipalityCode: "2927408", taxRegime: regime }, "1", { ...municipal, taxRegime: regime }).xml;
    assert.match(xml, /<OptanteSimplesNacional>2<\/OptanteSimplesNacional>/);
  }
  assert.throws(() => buildSalvadorBatch({ ...profile, municipalityCode: "2927408", taxRegime: "lucro_real" }, "1", municipal), /regime/);
  for (const regime of ["mei", "simples_nacional"] as const) assert.throws(() => buildSalvadorBatch({ ...profile, municipalityCode: "2927408", taxRegime: regime }, "1", { ...municipal, taxRegime: regime }), /nacional/);
});

test("signed XMLs for all national regimes and both Salvador municipal regimes validate against official schemas", async (t) => {
  const keys = forge.pki.rsa.generateKeyPair(2048), cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey; cert.serialNumber = "01"; cert.validity.notBefore = new Date("2026-01-01"); cert.validity.notAfter = new Date("2027-01-01"); cert.setSubject([{ name: "commonName", value: "Synthetic test" }]); cert.setIssuer(cert.subject.attributes); cert.sign(keys.privateKey);
  const key = forge.pki.privateKeyToPem(keys.privateKey), pem = forge.pki.certificateToPem(cert);
  const directory = await mkdtemp(join(tmpdir(), "aggenda-regimes-"));
  try {
    for (const regime of regimes) {
      const file = join(directory, `${regime}.xml`);
      await writeFile(file, signFiscalXml(buildDps({ ...profile, taxRegime: regime }, "sandbox", "1", "1", input(regime), new Date("2026-10-27T12:00:00Z")).xml, "infDPS", key, pem));
      try {
        const result = spawnSync("pwsh", ["-NoProfile", "-File", fileURLToPath(new URL("../scripts/verify-nfse-xsd.ps1", import.meta.url)), "-SchemaDirectory", fileURLToPath(new URL("../resources/nfse/national", import.meta.url)), "-XmlPath", file], { encoding: "utf8", timeout: 30000 });
        if (result.error && "code" in result.error && result.error.code === "ENOENT") { t.diagnostic("PowerShell indisponível; executar verificação XSD no ambiente de homologação."); return; }
        assert.equal(result.status, 0, `${regime}: ${result.stdout}\n${result.stderr}`);
      } finally { await unlink(file); }
    }
    for (const regime of ["lucro_presumido", "lucro_real"] as const) {
      const file = join(directory, `${regime}-salvador.xml`);
      await writeFile(file, signSalvadorBatch(buildSalvadorBatch({ ...profile, municipalityCode: "2927408", taxRegime: regime }, "1", { ...municipal, taxRegime: regime }).xml, key, pem));
      try {
        const result = spawnSync("pwsh", ["-NoProfile", "-File", fileURLToPath(new URL("../scripts/verify-salvador-xsd.ps1", import.meta.url)), "-XmlPath", file], { encoding: "utf8", timeout: 30000 });
        assert.equal(result.status, 0, `${regime}: ${result.stdout}\n${result.stderr}`);
      } finally { await unlink(file); }
    }
  } finally { await rmdir(directory); }
});

test("Postgres stores regime snapshots for all four regimes and refuses profile changes before network I/O", async () => {
  const keys = { test: randomBytes(32).toString("base64") };
  process.env.NFSE_STORAGE_KEYS = JSON.stringify(keys); process.env.NFSE_STORAGE_ACTIVE_KEY = "test";
  const client = new PGlite(), vault = new NfseVault(keys, "test");
  try {
    await client.exec(`CREATE TABLE organizations(id uuid PRIMARY KEY); CREATE TABLE financial_entries(id uuid PRIMARY KEY, organization_id uuid NOT NULL, type text NOT NULL, status text NOT NULL, amount_in_cents integer NOT NULL); CREATE TABLE fiscal_documents(id uuid PRIMARY KEY, organization_id uuid NOT NULL, financial_entry_id uuid, status text);`);
    for (const migration of ["0068_nfse_requests", "0069_nfse_custody_events", "0070_nfse_rejected_attempts"]) await client.exec(await readFile(new URL(`../drizzle/${migration}.sql`, import.meta.url), "utf8"));
    const database = drizzle(client) as unknown as typeof db, organizationId = randomUUID();
    await client.query("INSERT INTO organizations VALUES ($1)", [organizationId]);
    let network = 0;
    const service = new NfseService(database, async () => { network++; throw new Error("not called"); }, null, vault);
    for (const regime of regimes) {
      const entry = randomUUID(); await client.query("INSERT INTO financial_entries VALUES ($1,$2,'receivable','received',25000)", [entry, organizationId]);
      const row = await service.draft(organizationId, entry, { ...profile, taxRegime: regime }, "sandbox", input(regime));
      const stored = JSON.parse(vault.decrypt(organizationId, `${row.id}/draft`, row.encryptedDraft));
      assert.equal(stored.tax.regime, regime); assert.equal(stored.issuer.taxRegime, regime);
      await assert.rejects(service.submit(organizationId, row.id, { ...profile, taxRegime: regime === "lucro_real" ? "lucro_presumido" : "lucro_real" }, (xml) => xml), /regime/);
      assert.equal(network, 0);
    }
  } finally { await client.close(); }
});
