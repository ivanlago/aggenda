import assert from "node:assert/strict";
import test from "node:test";
import { fiscalChannelFor } from "../src/lib/nfse/tax-regimes";
import { nfseMunicipalityReference } from "../src/lib/nfse/municipalities";
import { nfseOnboardingSchema } from "../src/lib/nfse/onboarding";
import { buildDps, type FiscalDraft } from "../src/lib/nfse/xml";
import type { NfseFiscalProfile } from "../src/lib/nfse-routing";
import { camacariContractSchema, camacariSandboxTransport, camacariSoapEnvelope, unwrapCamacariSoap, type CamacariContract } from "../src/lib/nfse/camacari/transport";

// Synthetic binding: exercises isolation and framing, not a claimed municipal WSDL.
const binding = { namespace: "https://example.test/camacari", action: "https://example.test/send", request: "Send", parameter: "xml", response: "SendResponse", result: "Result", payloadRoot: "TestRequest", payloadNamespace: "https://example.test/payload" };
const contract: CamacariContract = { reviewedForSandbox: true, layout2026AcceptedForSandbox: true, trainingAccessConfirmed: true, soapVersion: "1.1", schemaSha256: "a".repeat(64), sendSync: binding, byRps: binding, cancel: binding, substitute: binding };
const payload = '<TestRequest xmlns="https://example.test/payload"><Value>ação</Value></TestRequest>';

test("Camaçari routes by regime and exact Bahia transition without claiming homologation", () => {
  const before = new Date("2026-11-01T02:59:59Z"), after = new Date("2026-11-01T03:00:00Z");
  for (const date of [before, after]) {
    assert.equal(fiscalChannelFor("2905701", "mei", date), "national");
    assert.equal(fiscalChannelFor("2905701", "lucro_presumido", date), "camacari");
    assert.equal(fiscalChannelFor("2905701", "lucro_real", date), "camacari");
  }
  assert.equal(fiscalChannelFor("2905701", "simples_nacional", before), "camacari");
  assert.equal(fiscalChannelFor("2905701", "simples_nacional", after), "national");
  assert.equal(nfseMunicipalityReference("2905701", "simples_nacional", before)?.suggestedChannel, "municipal");
  assert.equal(nfseMunicipalityReference("2905701", "simples_nacional", after)?.suggestedChannel, "national");
  assert.equal(nfseMunicipalityReference("2905701", "lucro_real")?.automaticIssuanceAvailable, false);
  assert.equal(nfseOnboardingSchema.parse({ cnpj: "11222333000181", municipalityCode: "2905701", taxRegime: "lucro_real" }).municipalityCode, "2905701");
});

test("Camaçari contract rejects unreviewed layouts, production and mismatched XML before network", async () => {
  assert.equal(camacariContractSchema.safeParse({ ...contract, layout2026AcceptedForSandbox: false }).success, false);
  assert.equal(camacariContractSchema.safeParse({ ...contract, trainingAccessConfirmed: false }).success, false);
  assert.throws(() => camacariSandboxTransport({ pfxBase64: "", password: "", fileName: "" }, contract, "production", async () => {}), /Produção/);
  assert.throws(() => camacariSoapEnvelope(contract, "sendSync", '<DPS xmlns="urn:national"/>'), /contrato/);
  assert.throws(() => camacariSoapEnvelope(contract, "sendSync", '<!DOCTYPE foo [<!ENTITY x "bad">]><TestRequest xmlns="urn:test:payload"/>'), /inválido/);
  assert.throws(() => camacariSoapEnvelope(contract, "sendSync", payload.replace("ação", "á".repeat(300000))), /limite|512/);
  const send = camacariSandboxTransport({ pfxBase64: "", password: "", fileName: "" }, contract, "sandbox", async () => { throw new Error("XSD não validado"); });
  await assert.rejects(send("sendSync", payload), /XSD não validado/);
});

test("national XML generator rejects Camaçari municipal profiles before preparing a DPS", () => {
  const profile: NfseFiscalProfile = { cnpj: "11222333000181", municipalRegistration: "123", municipalityCode: "2905701", taxRegime: "lucro_presumido", routingMode: "government", compatibilityStatus: "compatible", partnerFallbackAuthorized: false };
  for (const regime of ["lucro_presumido", "lucro_real", "simples_nacional"] as const) {
    assert.throws(() => buildDps({ ...profile, taxRegime: regime }, "sandbox", "1", "1", {} as FiscalDraft, new Date("2026-10-27T12:00:00Z")), /canal municipal/);
  }
});

test("Camaçari SOAP handles both versions and rejects ambiguous, fault and entity responses", () => {
  for (const version of ["1.1", "1.2"] as const) {
    const current = { ...contract, soapVersion: version };
    const envelope = camacariSoapEnvelope(current, "sendSync", payload);
    assert.match(envelope, /&lt;TestRequest/);
    const ns = version === "1.1" ? "http://schemas.xmlsoap.org/soap/envelope/" : "http://www.w3.org/2003/05/soap-envelope";
    const response = `<s:Envelope xmlns:s="${ns}"><s:Body><SendResponse xmlns="https://example.test/camacari"><Result>&lt;Response/&gt;</Result></SendResponse></s:Body></s:Envelope>`;
    assert.equal(unwrapCamacariSoap(current, "sendSync", response), "<Response/>");
    assert.throws(() => unwrapCamacariSoap(current, "sendSync", response.replace("</s:Body>", "<Extra/></s:Body>")), /ambígua/);
    assert.throws(() => unwrapCamacariSoap(current, "sendSync", response.replace("&lt;Response/&gt;", "<Response/>")), /serializado/);
    assert.throws(() => unwrapCamacariSoap(current, "sendSync", response.replace("SendResponse", "Fault")), /inválido|ambígua/);
  }
});
