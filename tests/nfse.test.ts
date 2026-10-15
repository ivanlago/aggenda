import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import test from "node:test";
import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import { DOMParser } from "@xmldom/xmldom";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { db } from "../src/db";
import * as schema from "../src/db/schema";
import { readFiscalCertificate } from "../src/lib/nfse/certificate";
import { compressFiscalXml, decompressFiscalXml, type FiscalTransport } from "../src/lib/nfse/government";
import { authorizedInvoice, buildCancellation, buildDps, signFiscalXml, type FiscalDraft } from "../src/lib/nfse/xml";
import { NfseService } from "../src/lib/nfse/service";
import { interpretMunicipalAgreement, type NfseFiscalProfile } from "../src/lib/nfse-routing";

const profile: NfseFiscalProfile = { cnpj: "11222333000181", municipalRegistration: "1234", municipalityCode: "2927408", taxRegime: "simples_nacional", routingMode: "pending_analysis", compatibilityStatus: "not_checked", partnerFallbackAuthorized: false };
const input: FiscalDraft = { payerDocument: "52998224725", payerName: "Pessoa de teste", description: "Consulta & avaliação <teste>", serviceCode: "040101", competence: "2026-10-15", amountInCents: 25000, totalTaxPercent: 6 };
const accessKey = "1".repeat(50);
function invoice(id: string) { return `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS${accessKey}"><nNFSe>123</nNFSe><DPS><infDPS Id="${id}"><tpAmb>2</tpAmb><prest><CNPJ>${profile.cnpj}</CNPJ></prest><valores><vServ>250.00</vServ></valores></infDPS></DPS></infNFSe></NFSe>`; }

test("certificate: checks password, CNPJ, expiry, key and client authentication", async () => {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate(); cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date("2026-01-01"); cert.validity.notAfter = new Date("2027-01-01");
  cert.setSubject([{ name: "commonName", value: "Synthetic fixture" }]); cert.setIssuer(cert.subject.attributes);
  const otherName = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, forge.asn1.oidToDer("2.16.76.1.3.3").getBytes()),
    forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.UTF8, false, profile.cnpj)]),
  ]);
  cert.setExtensions([{ name: "extKeyUsage", clientAuth: true }, { id: "2.5.29.17", value: forge.asn1.toDer(forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [otherName])).getBytes() }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, cert, " secret ", { algorithm: "3des" });
  const secret = { pfxBase64: forge.util.encode64(forge.asn1.toDer(p12).getBytes()), password: " secret ", fileName: "fixture.pfx" };
  const parsed = readFiscalCertificate(secret, profile.cnpj, new Date("2026-10-15"));
  assert.equal(parsed.expiresAt, "2027-01-01T00:00:00.000Z");
  assert.throws(() => readFiscalCertificate({ ...secret, password: "wrong" }, profile.cnpj), /senha/);
  assert.throws(() => readFiscalCertificate(secret, "00000000000000", new Date("2026-10-15")), /CNPJ/);
  assert.throws(() => readFiscalCertificate(secret, profile.cnpj, new Date("2028-01-01")), /vencido/);
  const dps = buildDps(profile, "sandbox", "1", "1", input, new Date("2026-10-15"));
  const signed = signFiscalXml(dps.xml, "infDPS", parsed.privateKeyPem, parsed.certificatePem);
  const doc = new DOMParser().parseFromString(signed, "text/xml");
  const verifier = new SignedXml({ publicCert: parsed.certificatePem });
  verifier.loadSignature(doc.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature")[0].toString());
  assert.equal(verifier.checkSignature(signed), true);
  assert.equal(verifier.checkSignature(signed.replace("250.00", "251.00")), false);
  if (process.env.NFSE_XSD_FIXTURE) await writeFile(process.env.NFSE_XSD_FIXTURE, signed);
});

test("DPS: stable identity, escaping, explicit supported scenario and bounded XML", async () => {
  const dps = buildDps(profile, "sandbox", "1", "1", input, new Date("2026-10-15"));
  assert.equal(dps.id.length, 45);
  assert.match(dps.xml, /Consulta &amp; avaliação &lt;teste&gt;/);
  assert.equal(decompressFiscalXml(compressFiscalXml(dps.xml)), dps.xml);
  assert.throws(() => buildDps({ ...profile, taxRegime: "lucro_real" }, "sandbox", "1", "1", input), /piloto/);
  assert.throws(() => buildDps(profile, "sandbox", "1", "1", { ...input, competence: "2026-02-31" }));
  assert.deepEqual(authorizedInvoice(invoice(dps.id), { dpsId: dps.id, cnpj: profile.cnpj, environment: "sandbox", amountInCents: 25000 }), { key: accessKey, number: "123" });
  assert.throws(() => authorizedInvoice(invoice(dps.id), { dpsId: dps.id, cnpj: "wrong", environment: "sandbox", amountInCents: 25000 }));
  assert.throws(() => authorizedInvoice(`<!DOCTYPE x>${invoice(dps.id)}`, { dpsId: dps.id, cnpj: profile.cnpj, environment: "sandbox", amountInCents: 25000 }));
  assert.equal(interpretMunicipalAgreement(200, {}).status, "unavailable");
  assert.equal(interpretMunicipalAgreement(404, null).status, "unavailable");
  assert.equal(interpretMunicipalAgreement(200, { aderenteEmissorNacional: false }).status, "incompatible");
});

test("Postgres: tenant isolation, duplicate clicks, timeout recovery and production guard", async (t) => {
  process.env.FINANCIAL_INTEGRATION_SECRET = "synthetic-test-secret";
  process.env.NFSE_STORAGE_KEYS = JSON.stringify({ test: randomBytes(32).toString("base64") });
  process.env.NFSE_STORAGE_ACTIVE_KEY = "test";
  const client = new PGlite();
  try {
    await client.exec(`CREATE TABLE organizations(id uuid PRIMARY KEY); CREATE TABLE financial_entries(id uuid PRIMARY KEY, organization_id uuid NOT NULL, type text NOT NULL, status text NOT NULL, amount_in_cents integer NOT NULL); CREATE TABLE fiscal_documents(id uuid PRIMARY KEY, organization_id uuid NOT NULL, financial_entry_id uuid, status text);`);
    await client.exec(await readFile(new URL("../drizzle/0068_nfse_requests.sql", import.meta.url), "utf8"));
    await client.exec(await readFile(new URL("../drizzle/0069_nfse_custody_events.sql", import.meta.url), "utf8"));
    await client.exec(await readFile(new URL("../drizzle/0070_nfse_rejected_attempts.sql", import.meta.url), "utf8"));
    const database = drizzle(client, { schema }) as unknown as typeof db;
    const organizationId = randomUUID(); const other = randomUUID();
    await client.query("INSERT INTO organizations VALUES ($1), ($2)", [organizationId, other]);
    const makeEntry = async () => { const id = randomUUID(); await client.query("INSERT INTO financial_entries VALUES ($1,$2,'receivable','received',25000)", [id, organizationId]); return id; };
    let posts = 0; let mode = "timeout"; let pendingId = "";
    const transport: FiscalTransport = async (path, options) => {
      if (options?.method === "POST") { posts++; if (mode === "timeout") throw new Error("timeout after acceptance"); return { status: 201, body: { nfseXmlGZipB64: compressFiscalXml(invoice(pendingId)) } }; }
      if (path.startsWith("/dps/")) return { status: 200, body: { chaveAcesso: accessKey } };
      return { status: 200, body: { nfseXmlGZipB64: compressFiscalXml(invoice(pendingId)) } };
    };
    const service = new NfseService(database, transport);
    await t.test("cross-tenant draft and lookup are denied", async () => {
      const entry = await makeEntry();
      await assert.rejects(service.draft(other, entry, profile, "sandbox", input), /clínica/);
      const row = await service.draft(organizationId, entry, profile, "sandbox", input);
      await assert.rejects(service.get(other, row.id), /não encontrada/);
    });
    await t.test("one draft per entry and environment; no production requests", async () => {
      const entry = await makeEntry();
      const a = await service.draft(organizationId, entry, profile, "sandbox", input);
      const b = await service.draft(organizationId, entry, profile, "sandbox", input);
      assert.equal(a.id, b.id);
      await assert.rejects(service.draft(organizationId, entry, profile, "production", input), /produção/);
      await assert.rejects(service.draft(organizationId, await makeEntry(), profile, "sandbox", { ...input, amountInCents: 1 }), /valor/);
    });
    await t.test("concurrent submissions issue once and recover accepted timeout through GET", async () => {
      const row = await service.draft(organizationId, await makeEntry(), profile, "sandbox", input); pendingId = row.dpsId;
      await Promise.all([service.submit(organizationId, row.id, profile, (xml) => xml), service.submit(organizationId, row.id, profile, (xml) => xml)]);
      assert.equal(posts, 1);
      await service.reconcile(organizationId, row.id);
      const recovered = await service.get(organizationId, row.id);
      assert.equal(recovered.status, "authorized");
      assert.ok(recovered.encryptedXml && !recovered.encryptedXml.includes(profile.cnpj));
      await service.submit(organizationId, row.id, profile, (xml) => xml);
      assert.equal(posts, 1);
    });
    await t.test("valid success persists authorization, wrong XML remains uncertain", async () => {
      mode = "success";
      const row = await service.draft(organizationId, await makeEntry(), profile, "sandbox", input); pendingId = row.dpsId;
      await service.submit(organizationId, row.id, profile, (xml) => xml);
      assert.equal((await service.get(organizationId, row.id)).status, "authorized");
      const wrong = await service.draft(organizationId, await makeEntry(), profile, "sandbox", input);
      await service.submit(organizationId, wrong.id, profile, (xml) => xml);
      assert.equal((await service.get(organizationId, wrong.id)).status, "uncertain");
    });
    await t.test("cancellation timeout preserves signed request; query confirms event without repost", async () => {
      const entry = await makeEntry();
      let id = ""; let cancellationPosts = 0;
      const eventXml = () => `<evento xmlns="http://www.sped.fazenda.gov.br/nfse"><infEvento Id="EVT${accessKey}101101001">${buildCancellation(accessKey, profile.cnpj, "sandbox", "Serviço de teste não prestado", "2")}</infEvento></evento>`;
      const cancelTransport: FiscalTransport = async (path, options) => {
        if (path.endsWith("/eventos") && options?.method === "POST") { cancellationPosts++; throw new Error("timeout"); }
        if (path.includes("/eventos/")) return { status: 200, body: { eventoXmlGZipB64: compressFiscalXml(eventXml()) } };
        return { status: 201, body: { nfseXmlGZipB64: compressFiscalXml(invoice(id)) } };
      };
      const cancelService = new NfseService(database, cancelTransport, "operator");
      const row = await cancelService.draft(organizationId, entry, profile, "sandbox", input); id = row.dpsId;
      await cancelService.submit(organizationId, row.id, profile, (xml) => xml);
      await cancelService.cancel(organizationId, row.id, profile, "Serviço de teste não prestado", "2", (xml) => xml);
      assert.equal((await cancelService.get(organizationId, row.id)).status, "cancellation_uncertain");
      await cancelService.cancel(organizationId, row.id, profile, "Outra tentativa de cancelamento", "1", (xml) => xml);
      assert.equal(cancellationPosts, 1);
      assert.equal((await cancelService.get(organizationId, row.id)).status, "cancelled");
      const audit = await client.query<{ type: string; user_id: string }>("SELECT type,user_id FROM nfse_request_events WHERE request_id=$1", [row.id]);
      assert.ok(audit.rows.some((event) => event.type === "cancelled" && event.user_id === "operator"));
    });
    await t.test("definitive rejection preserves original attempt and permits a corrected draft", async () => {
      const entry = await makeEntry(); let id = "";
      const rejecting = new NfseService(database, async () => ({ status: 400, body: { idDPS: id, erros: [{ Codigo: "E0010" }] } }));
      const row = await rejecting.draft(organizationId, entry, profile, "sandbox", input); id = row.dpsId;
      await rejecting.submit(organizationId, row.id, profile, (xml) => xml);
      assert.equal((await rejecting.get(organizationId, row.id)).status, "rejected");
      const revision = await rejecting.draft(organizationId, entry, { ...profile, dpsSeries: "2" }, "sandbox", input);
      assert.notEqual(revision.id, row.id); assert.notEqual(revision.dpsId, row.dpsId);
      assert.equal((await rejecting.get(organizationId, row.id)).status, "rejected");
    });
  } finally { await client.close(); }
});
