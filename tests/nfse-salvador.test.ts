import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdtemp, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import { XMLSerializer } from "@xmldom/xmldom";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { db } from "../src/db";
import { NfseService } from "../src/lib/nfse/service";
import { NfseVault } from "../src/lib/nfse/vault";
import { SalvadorNfseService } from "../src/lib/nfse/salvador/service";
import { salvadorContractSchema, salvadorSandboxTransport, salvadorSoapEnvelope, unwrapSalvadorSoap, type SalvadorTransport } from "../src/lib/nfse/salvador/transport";
import { acceptedSalvadorBatch, authorizedSalvadorInvoice, buildSalvadorBatch, buildSalvadorBatchQuery, buildSalvadorRpsQuery, parseSalvadorXml, salvadorDraftSchema, salvadorReturnCodes, salvadorNamespace, signSalvadorBatch, type SalvadorDraft, type SalvadorIssuer } from "../src/lib/nfse/salvador/xml";

const issuer: SalvadorIssuer = { cnpj: "11222333000181", municipalRegistration: "123456", municipalityCode: "2927408", taxRegime: "lucro_presumido" };
const draft: SalvadorDraft = { channel: "salvador", rpsNumber: "100", rpsSeries: "AG1", issuedAt: "2026-10-27T10:00:00-03:00", payerDocument: "52998224725", payerName: "Pessoa teste", address: { street: "Rua Teste", number: "10", district: "Centro", municipalityCode: "2927408", state: "BA", zip: "40000000" }, description: "Consulta & avaliação <teste>", itemList: "04.01", cnae: "8630503", nbs: "123456789", taxClassification: "000001", operationIndicator: "100301", amountInCents: 25000, issRateBasisPoints: 500, scenario: "presumido_local_sem_retencoes" };
function invoice(input = draft, provider = issuer) {
  return `<ConsultarNfseRpsResposta xmlns="${salvadorNamespace}"><CompNfse><Nfse><InfNfse id="N123"><Numero>123</Numero><CodigoVerificacao>ABC123</CodigoVerificacao><IdentificacaoRps><Numero>${input.rpsNumber}</Numero><Serie>${input.rpsSeries}</Serie><Tipo>1</Tipo></IdentificacaoRps><Servico><Valores><ValorServicos>${(input.amountInCents / 100).toFixed(2)}</ValorServicos></Valores></Servico><PrestadorServico><IdentificacaoPrestador><Cnpj>${provider.cnpj}</Cnpj><InscricaoMunicipal>${provider.municipalRegistration}</InscricaoMunicipal></IdentificacaoPrestador></PrestadorServico><TomadorServico><IdentificacaoTomador><CpfCnpj><Cpf>${input.payerDocument}</Cpf></CpfCnpj></IdentificacaoTomador></TomadorServico><OrgaoGerador><CodigoMunicipio>2927408</CodigoMunicipio><Uf>BA</Uf></OrgaoGerador></InfNfse></Nfse></CompNfse></ConsultarNfseRpsResposta>`;
}
const contract = salvadorContractSchema.parse({ soapVersion: "1.1", reviewedForSandbox: true, layout2026AcceptedForSandbox: true, ...Object.fromEntries(["send", "byRps", "batch", "batchStatus"].map((key) => [key, { namespace: "http://example.test/", action: `http://example.test/${key}`, request: key, parameter: "xml", response: `${key}Response`, result: `${key}Result` }])) });

test("municipal XML has explicit Presumido taxation, escaping, no invented fields and strict scenario validation", () => {
  const batch = buildSalvadorBatch(issuer, "1", draft);
  assert.match(batch.xml, /<OptanteSimplesNacional>2<\/OptanteSimplesNacional>/);
  assert.match(batch.xml, /<Aliquota>0.0500<\/Aliquota>/);
  assert.match(batch.xml, /<ValorIss>12.50<\/ValorIss>/);
  assert.match(batch.xml, /&amp; avaliação &lt;teste&gt;/);
  assert.doesNotMatch(batch.xml, /CodigoTributacaoMunicipio|pTotTribSN|<DPS/);
  assert.match(buildSalvadorRpsQuery(issuer, draft), /<Numero>100<\/Numero>/);
  assert.match(buildSalvadorBatchQuery(issuer, "ABC123", "batchStatus"), /<ConsultarSituacaoLoteRpsEnvio/);
  const accepted = `<EnviarLoteRpsResposta xmlns="${salvadorNamespace}"><NumeroLote>1</NumeroLote><Protocolo>ABC123</Protocolo></EnviarLoteRpsResposta>`;
  assert.equal(acceptedSalvadorBatch(accepted, "1"), "ABC123");
  assert.throws(() => acceptedSalvadorBatch(accepted, "2"));
  const codes = `<EnviarLoteRpsResposta xmlns="${salvadorNamespace}"><ListaMensagemRetorno><MensagemRetorno><Codigo>E10</Codigo><Mensagem>CPF privado que não deve aparecer em logs</Mensagem></MensagemRetorno></ListaMensagemRetorno></EnviarLoteRpsResposta>`;
  assert.deepEqual(salvadorReturnCodes(codes, "EnviarLoteRpsResposta"), ["E10"]);
  assert.deepEqual(salvadorReturnCodes(codes.replace("E10", "CPF 52998224725"), "EnviarLoteRpsResposta"), []);
  assert.throws(() => buildSalvadorBatch({ ...issuer, municipalityCode: "2919207" }, "1", draft));
  assert.throws(() => buildSalvadorBatch({ ...issuer, taxRegime: "mei" }, "1", draft));
  assert.equal(salvadorDraftSchema.safeParse({ ...draft, issuedAt: "2026-02-30T10:00:00-03:00" }).success, false);
  assert.equal(salvadorDraftSchema.safeParse({ ...draft, issRateBasisPoints: 0 }).success, false);
  assert.equal(salvadorDraftSchema.safeParse({ ...draft, retainedIss: true }).success, false);
  assert.equal(authorizedSalvadorInvoice(invoice(), issuer, draft).number, "123");
  assert.throws(() => authorizedSalvadorInvoice(invoice({ ...draft, rpsNumber: "101" }), issuer, draft));
  assert.throws(() => authorizedSalvadorInvoice(invoice({ ...draft, amountInCents: 1 }), issuer, draft));
  assert.throws(() => authorizedSalvadorInvoice(invoice(draft, { ...issuer, cnpj: "99999999000199" }), issuer, draft));
  assert.throws(() => authorizedSalvadorInvoice(invoice().replace("<CompNfse>", "<CompNfse/><CompNfse>"), issuer, draft));
  assert.throws(() => parseSalvadorXml(`<!DOCTYPE x [<!ENTITY x SYSTEM "file:///secret">]><x>&x;</x>`));
});

test("signatures bind both RPS and batch, and signed XML validates against the published municipal XSD", async (t) => {
  const keys = forge.pki.rsa.generateKeyPair(2048), certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey; certificate.serialNumber = "01";
  certificate.validity.notBefore = new Date("2026-01-01"); certificate.validity.notAfter = new Date("2027-01-01");
  certificate.setSubject([{ name: "commonName", value: "Synthetic test" }]); certificate.setIssuer(certificate.subject.attributes); certificate.sign(keys.privateKey);
  const pem = forge.pki.certificateToPem(certificate);
  const signed = signSalvadorBatch(buildSalvadorBatch(issuer, "1", draft).xml, forge.pki.privateKeyToPem(keys.privateKey), pem);
  const signatures = parseSalvadorXml(signed).getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature");
  assert.equal(signatures.length, 2);
  for (const signature of Array.from(signatures)) {
    const verifier = new SignedXml({ publicCert: pem }); verifier.loadSignature(new XMLSerializer().serializeToString(signature));
    assert.equal(verifier.checkSignature(signed), true);
    assert.equal(verifier.checkSignature(signed.replace("250.00", "251.00")), false);
  }
  const directory = await mkdtemp(join(tmpdir(), "aggenda-salvador-")), file = join(directory, "signed.xml");
  try {
    await writeFile(file, signed);
    const result = spawnSync("pwsh", ["-NoProfile", "-File", fileURLToPath(new URL("../scripts/verify-salvador-xsd.ps1", import.meta.url)), "-XmlPath", file], { encoding: "utf8", timeout: 30000 });
    if (result.error && "code" in result.error && result.error.code === "ENOENT") { t.diagnostic("PowerShell indisponível: execute o verificador XSD no ambiente de homologação."); return; }
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  } finally { await unlink(file); await rmdir(directory); }
});

test("SOAP requires a reviewed binding, rejects faults and ambiguous envelopes, and cannot target production", () => {
  const envelope = salvadorSoapEnvelope(contract, "send", buildSalvadorBatch(issuer, "1", draft).xml);
  assert.match(envelope, /&lt;EnviarLoteRpsEnvio/);
  const response = `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><byRpsResponse xmlns="http://example.test/"><byRpsResult>${invoice().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</byRpsResult></byRpsResponse></s:Body></s:Envelope>`;
  assert.equal(unwrapSalvadorSoap(contract, "byRps", response), invoice());
  assert.throws(() => unwrapSalvadorSoap(contract, "send", response));
  assert.throws(() => unwrapSalvadorSoap(contract, "byRps", response.replace("</s:Body>", "<s:Fault/></s:Body>")));
  assert.throws(() => salvadorContractSchema.parse({ ...contract, reviewedForSandbox: false }));
  assert.throws(() => salvadorSandboxTransport({ pfxBase64: "", password: "", fileName: "" }, contract, "production"));
});

test("Postgres municipal flow isolates tenants/channels, sends once, recovers timeout by RPS and preserves uncertain results", async () => {
  const client = new PGlite(), vault = new NfseVault({ test: randomBytes(32).toString("base64") }, "test");
  try {
    await client.exec(`CREATE TABLE organizations(id uuid PRIMARY KEY); CREATE TABLE financial_entries(id uuid PRIMARY KEY, organization_id uuid NOT NULL, type text NOT NULL, status text NOT NULL, amount_in_cents integer NOT NULL); CREATE TABLE fiscal_documents(id uuid PRIMARY KEY, organization_id uuid NOT NULL, financial_entry_id uuid, status text);`);
    for (const migration of ["0068_nfse_requests", "0069_nfse_custody_events", "0070_nfse_rejected_attempts"]) await client.exec(await readFile(new URL(`../drizzle/${migration}.sql`, import.meta.url), "utf8"));
    const database = drizzle(client) as unknown as typeof db;
    const organizationId = randomUUID(), other = randomUUID();
    await client.query("INSERT INTO organizations VALUES ($1),($2)", [organizationId, other]);
    const makeEntry = async () => { const id = randomUUID(); await client.query("INSERT INTO financial_entries VALUES ($1,$2,'receivable','received',25000)", [id, organizationId]); return id; };
    let sends = 0, badInvoice = true;
    const transport: SalvadorTransport = async (operation) => { if (operation === "send") { sends++; throw new Error("Accepted then timeout"); } return invoice(badInvoice ? { ...draft, amountInCents: 1 } : draft); };
    const service = new SalvadorNfseService(database, transport, null, vault);
    const national = new NfseService(database, async () => { throw new Error("Must not use national transport"); }, null, vault);
    const entry = await makeEntry();
    await assert.rejects(service.draft(other, entry, issuer, "sandbox", draft), /clínica/);
    await assert.rejects(service.draft(organizationId, entry, issuer, "production", draft), /Produção/);
    const row = await service.draft(organizationId, entry, issuer, "sandbox", draft);
    assert.equal((await service.draft(organizationId, entry, issuer, "sandbox", draft)).id, row.id);
    await assert.rejects(service.get(other, row.id), /não encontrada/);
    await assert.rejects(national.get(organizationId, row.id), /municipal/);
    await assert.rejects(national.draft(organizationId, entry, { ...issuer, taxRegime: "simples_nacional", routingMode: "pending_analysis", compatibilityStatus: "not_checked", partnerFallbackAuthorized: false }, "sandbox", { payerDocument: draft.payerDocument, payerName: draft.payerName, description: draft.description, serviceCode: "040101", competence: "2026-10-27", amountInCents: 25000, totalTaxPercent: 6 }), /municipal/);
    await assert.rejects(service.draft(organizationId, await makeEntry(), issuer, "sandbox", draft), /reservado/);
    await Promise.all([service.submit(organizationId, row.id, issuer, (xml) => xml), service.submit(organizationId, row.id, issuer, (xml) => xml)]);
    assert.equal(sends, 1);
    assert.equal((await service.get(organizationId, row.id)).status, "uncertain");
    await service.submit(organizationId, row.id, issuer, (xml) => xml);
    assert.equal(sends, 1);
    assert.equal((await service.get(organizationId, row.id)).status, "uncertain");
    badInvoice = false;
    await service.reconcile(organizationId, row.id);
    const authorized = await service.get(organizationId, row.id);
    assert.equal(authorized.status, "authorized");
    assert.equal(authorized.number, "123");
    assert.ok(authorized.encryptedXml && !authorized.encryptedXml.includes(draft.payerDocument));
    await service.submit(organizationId, row.id, issuer, (xml) => xml);
    assert.equal(sends, 1);
    const changedEntry = await makeEntry();
    const changed = await service.draft(organizationId, changedEntry, issuer, "sandbox", { ...draft, rpsNumber: "101" });
    await client.query("UPDATE financial_entries SET amount_in_cents=1 WHERE id=$1", [changedEntry]);
    await assert.rejects(service.submit(organizationId, changed.id, issuer, (xml) => xml), /recebimento/);
    assert.equal(sends, 1);
  } finally { await client.close(); }
});
