/** Local audit only: synthetic certificate, isolated Postgres and simulated government.
 * Does not load .env, connect to production or write private keys to disk.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { performance } from "node:perf_hooks";
import forge from "node-forge";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { db } from "../src/db";
import * as schema from "../src/db/schema";
import { readFile } from "node:fs/promises";
import { readFiscalCertificate } from "../src/lib/nfse/certificate";
import { encryptFinancialCredential } from "../src/lib/financial-secret";
import { NfseService } from "../src/lib/nfse/service";
import { buildDps, signFiscalXml, type FiscalDraft } from "../src/lib/nfse/xml";
import { compressFiscalXml, type FiscalTransport } from "../src/lib/nfse/government";
import type { NfseFiscalProfile } from "../src/lib/nfse-routing";

const profile: NfseFiscalProfile = { cnpj: "11222333000181", municipalRegistration: "1234", municipalityCode: "2927408", taxRegime: "simples_nacional", routingMode: "pending_analysis", compatibilityStatus: "not_checked", partnerFallbackAuthorized: false };
const draft: FiscalDraft = { payerDocument: "52998224725", payerName: "Pessoa sintética de teste", description: "Consulta de teste sem dados reais", serviceCode: "040101", competence: "2026-10-15", amountInCents: 25000, totalTaxPercent: 6 };

function fixture() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const certificate = forge.pki.createCertificate(); certificate.publicKey = keys.publicKey; certificate.serialNumber = "01";
  certificate.validity.notBefore = new Date("2026-01-01"); certificate.validity.notAfter = new Date("2027-01-01");
  certificate.setSubject([{ name: "commonName", value: "Synthetic audit fixture" }]); certificate.setIssuer(certificate.subject.attributes);
  const otherName = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, forge.asn1.oidToDer("2.16.76.1.3.3").getBytes()),
    forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.UTF8, false, profile.cnpj)]),
  ]);
  certificate.setExtensions([{ name: "extKeyUsage", clientAuth: true }, { id: "2.5.29.17", value: forge.asn1.toDer(forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [otherName])).getBytes() }]);
  certificate.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, certificate, "synthetic-password", { algorithm: "3des" });
  return { pfxBase64: forge.util.encode64(forge.asn1.toDer(p12).getBytes()), password: "synthetic-password", fileName: "synthetic.pfx" };
}

function measure(fn: () => unknown, repetitions = 80) {
  for (let i = 0; i < 5; i++) fn();
  const elapsed: number[] = []; const cpu = process.cpuUsage();
  for (let i = 0; i < repetitions; i++) { const start = performance.now(); fn(); elapsed.push(performance.now() - start); }
  const used = process.cpuUsage(cpu); elapsed.sort((a, b) => a - b);
  return { repetitions, medianMs: elapsed[Math.floor(elapsed.length / 2)], p95Ms: elapsed[Math.ceil(elapsed.length * 0.95) - 1], meanCpuMs: (used.user + used.system) / 1000 / repetitions };
}

async function main() {
  process.env.FINANCIAL_INTEGRATION_SECRET = randomBytes(32).toString("base64");
  process.env.NFSE_STORAGE_KEYS = JSON.stringify({ test: randomBytes(32).toString("base64") });
  process.env.NFSE_STORAGE_ACTIVE_KEY = "test";
  const secret = fixture(); const now = new Date("2026-10-15T12:00:00Z");
  const certificate = readFiscalCertificate(secret, profile.cnpj, now);
  const unsigned = buildDps(profile, "sandbox", "1", "1", draft, now);
  const signed = signFiscalXml(unsigned.xml, "infDPS", certificate.privateKeyPem, certificate.certificatePem);
  const invoice = (id: string, padding = 0) => `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS${"1".repeat(50)}"><nNFSe>123</nNFSe><DPS><infDPS Id="${id}"><tpAmb>2</tpAmb><prest><CNPJ>${profile.cnpj}</CNPJ></prest><valores><vServ>250.00</vServ></valores></infDPS></DPS><!--${"x".repeat(padding)}--></infNFSe></NFSe>`;
  const storage = [8192, 32768, 131072].map((target) => {
    const xml = invoice(unsigned.id, target);
    const encryptedDraft = encryptFinancialCredential(JSON.stringify(draft)); const encryptedDps = encryptFinancialCredential(signed); const encryptedXml = encryptFinancialCredential(xml);
    return { syntheticXmlBytes: Buffer.byteLength(xml), encryptedDraftBytes: Buffer.byteLength(encryptedDraft), encryptedDpsBytes: Buffer.byteLength(encryptedDps), encryptedXmlBytes: Buffer.byteLength(encryptedXml), encryptedPayloadBytesPerNote: Buffer.byteLength(encryptedDraft + encryptedDps + encryptedXml) };
  });
  const operations = {
    certificateRead: measure(() => readFiscalCertificate(secret, profile.cnpj, now)),
    signDps: measure(() => signFiscalXml(unsigned.xml, "infDPS", certificate.privateKeyPem, certificate.certificatePem)),
    submitLocalCrypto: measure(() => {
      const cert = readFiscalCertificate(secret, profile.cnpj, now);
      const xml = signFiscalXml(buildDps(profile, "sandbox", "1", "1", draft, now).xml, "infDPS", cert.privateKeyPem, cert.certificatePem);
      encryptFinancialCredential(xml); compressFiscalXml(xml);
    }),
  };
  const client = new PGlite();
  let stage = "setup"; const statements: Record<string, { selects: number; inserts: number; updates: number; transactions: number }> = {};
  const count = (query: string) => {
    const record = statements[stage] ??= { selects: 0, inserts: 0, updates: 0, transactions: 0 };
    if (/^select/i.test(query)) record.selects++; else if (/^insert/i.test(query)) record.inserts++; else if (/^update/i.test(query)) record.updates++; else if (/^(begin|commit|rollback)/i.test(query)) record.transactions++;
  };
  try {
    await client.exec(`CREATE TABLE organizations(id uuid PRIMARY KEY); CREATE TABLE financial_entries(id uuid PRIMARY KEY, organization_id uuid NOT NULL, type text NOT NULL, status text NOT NULL, amount_in_cents integer NOT NULL); CREATE TABLE fiscal_documents(id uuid PRIMARY KEY, organization_id uuid NOT NULL, financial_entry_id uuid, status text);`);
    await client.exec(await readFile(new URL("../drizzle/0068_nfse_requests.sql", import.meta.url), "utf8"));
    await client.exec(await readFile(new URL("../drizzle/0069_nfse_custody_events.sql", import.meta.url), "utf8"));
    await client.exec(await readFile(new URL("../drizzle/0070_nfse_rejected_attempts.sql", import.meta.url), "utf8"));
    const database = drizzle(client, { schema, logger: { logQuery: count } }) as unknown as typeof db;
    const org = randomUUID(); const entry = randomUUID(); let dps = "";
    await client.query("INSERT INTO organizations VALUES ($1)", [org]);
    await client.query("INSERT INTO financial_entries VALUES ($1,$2,'receivable','received',25000)", [entry, org]);
    let networkCalls = 0; let timeout = false;
    const transport: FiscalTransport = async (path, options) => {
      networkCalls++;
      if (options?.method === "POST" && timeout) throw new Error("synthetic timeout");
      if (path.startsWith("/dps/")) return { status: 200, body: { chaveAcesso: "1".repeat(50) } };
      return { status: 200, body: { nfseXmlGZipB64: compressFiscalXml(invoice(dps)) } };
    };
    const service = new NfseService(database, transport);
    stage = "prepare"; const row = await service.draft(org, entry, profile, "sandbox", draft); dps = row.dpsId;
    stage = "submitTimeout"; timeout = true;
    await service.submit(org, row.id, profile, (xml) => signFiscalXml(xml, "infDPS", certificate.privateKeyPem, certificate.certificatePem));
    stage = "recover"; timeout = false; await service.reconcile(org, row.id);
    // Stored rows and indexes in an isolated engine; no production inserts.
    stage = "storageSample";
    const before = await client.query<{ bytes: number }>("SELECT pg_total_relation_size('nfse_requests')::int AS bytes");
    const samples = 100;
    for (let i = 0; i < samples; i++) {
      const entryId = randomUUID(); await client.query("INSERT INTO financial_entries VALUES ($1,$2,'receivable','received',25000)", [entryId, org]);
      const id = `DPS${profile.municipalityCode}2${profile.cnpj}00001${String(i + 100).padStart(15, "0")}`;
      await database.insert(schema.nfseRequests).values({ organizationId: org, financialEntryId: entryId, environment: "sandbox", cnpj: profile.cnpj, dpsId: id, amountInCents: 25000, status: "authorized", encryptedDraft: encryptFinancialCredential(JSON.stringify(draft)), encryptedDps: encryptFinancialCredential(signed), encryptedXml: encryptFinancialCredential(invoice(id, 32768)) });
    }
    const after = await client.query<{ bytes: number }>("SELECT pg_total_relation_size('nfse_requests')::int AS bytes");
    const result = {
      measuredAt: new Date().toISOString(), runtime: process.version, platform: process.platform, cpuModel: cpus()[0]?.model,
      caveats: ["Synthetic self-signed RSA-2048 certificate; not ICP-Brasil acceptance", "No external network or production database", "Local CPU and duration are not measurements of deployed hosting", "Synthetic XML sizes; excludes PDF, audits, history, backups and WAL", "PGlite page allocation is illustrative, not a Neon storage invoice"],
      bytes: { pfx: Buffer.from(secret.pfxBase64, "base64").length, encryptedCertificate: Buffer.byteLength(encryptFinancialCredential(JSON.stringify(secret))), dps: Buffer.byteLength(signed), gzipBase64Dps: Buffer.byteLength(compressFiscalXml(signed)) },
      operations, storage, statements, networkCalls,
      postgresSample: { rows: samples, xmlPaddingBytes: 32768, relationBytesBefore: before.rows[0].bytes, relationBytesAfter: after.rows[0].bytes, addedBytesPerNote: (after.rows[0].bytes - before.rows[0].bytes) / samples },
    };
    const outputPath = "docs/nfse-medicao-local.json";
    await writeFile(outputPath, JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify(result, null, 2));
  } finally { await client.close(); }
}
main().catch(() => { console.error("Falha na medição local. Nenhuma chave ou credencial foi exportada."); process.exitCode = 1; });
