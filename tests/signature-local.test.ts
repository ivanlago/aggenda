import assert from "node:assert/strict";
import test from "node:test";
import { createHash, webcrypto } from "node:crypto";
import * as asn1 from "asn1js";
import { AttributeTypeAndValue, BasicConstraints, Certificate, CertificatePolicies, CertificateRevocationList,
  CRLDistributionPoints, CryptoEngine, DistributionPoint, Extension, GeneralName, PolicyInformation, RevokedCertificate, Time } from "pkijs";
import { IcpBrasilTrustValidator, personalCertificateIdentity, validCpf } from "../src/lib/signatures/icp-trust";
import { assertCeremony, bytesHash, matchesSignatureCode } from "../src/lib/signatures/local-policy";
import { isPublicPkiAddress, downloadPublicPki } from "../src/lib/signatures/public-download";
import roots from "../src/lib/signatures/trust/roots.json";
import { Attribute, ContentInfo, EncapsulatedContentInfo, IssuerAndSerialNumber, SignedAndUnsignedAttributes, SignedData, SignerInfo } from "pkijs";
import { PDFDocument } from "pdf-lib";
import { embedDetachedCms, inspectPreparedPdf, preparePadesPdf } from "../src/lib/signatures/pades";
import { SignatureService } from "../src/lib/signatures/service";
import { QualifiedPadesValidator } from "../src/lib/signatures/qualified-validation";
import type { SignatureRequest } from "../src/lib/signatures/types";

const engine = new CryptoEngine({ name: "local-signature-test", crypto: webcrypto as unknown as Crypto });
const encode = (value: { toSchema(): asn1.Sequence }) => value.toSchema().toBER(false);
const now = new Date();

async function fixture() {
  const makeKey = () => webcrypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const rootKeys = await makeKey(), leafKeys = await makeKey();
  const cn = (value: string) => new AttributeTypeAndValue({ type: "2.5.4.3", value: new asn1.Utf8String({ value }) });
  const root = new Certificate({ version: 2, serialNumber: new asn1.Integer({ value: 1 }), extensions: [] });
  root.subject.typesAndValues.push(cn("CA sintetica - SEM VALIDADE ICP"));
  root.issuer = root.subject;
  root.notBefore.value = new Date(now.getTime() - 60_000); root.notAfter.value = new Date(now.getTime() + 86400_000);
  root.extensions!.push(new Extension({ extnID: "2.5.29.19", critical: true, extnValue: encode(new BasicConstraints({ cA: true })) }),
    new Extension({ extnID: "2.5.29.15", critical: true, extnValue: new asn1.BitString({ valueHex: new Uint8Array([6]).buffer, unusedBits: 1 }).toBER(false) }));
  await root.subjectPublicKeyInfo.importKey(rootKeys.publicKey as CryptoKey, engine);
  await root.sign(rootKeys.privateKey as CryptoKey, "SHA-256", engine);
  const leaf = new Certificate({ version: 2, serialNumber: new asn1.Integer({ value: 2 }), extensions: [] });
  leaf.subject.typesAndValues.push(cn("Profissional sintetico")); leaf.issuer = root.subject;
  leaf.notBefore.value = root.notBefore.value; leaf.notAfter.value = root.notAfter.value;
  const personalName = new asn1.Constructed({ idBlock: { tagClass: 3, tagNumber: 0 }, value: [
    new asn1.ObjectIdentifier({ value: "2.16.76.1.3.1" }), new asn1.Constructed({ idBlock: { tagClass: 3, tagNumber: 0 },
      value: [new asn1.OctetString({ valueHex: Uint8Array.from(Buffer.from("01011990529982247250000000000000000000")).buffer })] }),
  ] });
  leaf.extensions!.push(new Extension({ extnID: "2.5.29.17", extnValue: new asn1.Sequence({ value: [personalName] }).toBER(false) }),
    new Extension({ extnID: "2.5.29.32", extnValue: encode(new CertificatePolicies({ certificatePolicies: [new PolicyInformation({ policyIdentifier: "2.16.76.1.2.1.999" })] })) }),
    new Extension({ extnID: "2.5.29.15", critical: true, extnValue: new asn1.BitString({ valueHex: new Uint8Array([128]).buffer, unusedBits: 7 }).toBER(false) }),
    new Extension({ extnID: "2.5.29.19", critical: true, extnValue: encode(new BasicConstraints({ cA: false })) }),
    new Extension({ extnID: "2.5.29.31", extnValue: encode(new CRLDistributionPoints({ distributionPoints: [new DistributionPoint({
      distributionPoint: [new GeneralName({ type: 6, value: "https://example.invalid/test.crl" })] })] })) }));
  await leaf.subjectPublicKeyInfo.importKey(leafKeys.publicKey as CryptoKey, engine);
  await leaf.sign(rootKeys.privateKey as CryptoKey, "SHA-256", engine);
  async function crl(revoked = false, expired = false, forged = false) {
    const list = new CertificateRevocationList({ version: 1, issuer: root.subject,
      thisUpdate: new Time({ type: 0, value: new Date(now.getTime() - 60_000) }),
      nextUpdate: new Time({ type: 0, value: new Date(now.getTime() + (expired ? -1000 : 3600_000)) }),
      revokedCertificates: revoked ? [new RevokedCertificate({ userCertificate: leaf.serialNumber, revocationDate: new Time({ type: 0, value: now }) })] : [] });
    await list.sign((forged ? leafKeys : rootKeys).privateKey as CryptoKey, "SHA-256", engine);
    return new Uint8Array(encode(list));
  }
  async function sign(prepared: Uint8Array) {
    const parsed = inspectPreparedPdf(prepared);
    const hash = (bytes: Uint8Array) => Uint8Array.from(createHash("sha256").update(bytes).digest()).buffer;
    const cms = new SignedData({ version: 1, certificates: [leaf, root], encapContentInfo: new EncapsulatedContentInfo({ eContentType: "1.2.840.113549.1.7.1" }),
      signerInfos: [new SignerInfo({ version: 1, sid: new IssuerAndSerialNumber({ issuer: leaf.issuer, serialNumber: leaf.serialNumber }),
        signedAttrs: new SignedAndUnsignedAttributes({ type: 0, attributes: [
          new Attribute({ type: "1.2.840.113549.1.9.3", values: [new asn1.ObjectIdentifier({ value: "1.2.840.113549.1.7.1" })] }),
          new Attribute({ type: "1.2.840.113549.1.9.4", values: [new asn1.OctetString({ valueHex: hash(parsed.content) })] }),
          new Attribute({ type: "1.2.840.113549.1.9.16.2.47", values: [new asn1.Sequence({ value: [new asn1.Sequence({ value: [new asn1.Sequence({
            value: [new asn1.OctetString({ valueHex: hash(new Uint8Array(encode(leaf))) })] })] })] })] }),
        ] }) })] });
    await cms.sign(leafKeys.privateKey as CryptoKey, 0, "SHA-256", parsed.content, engine);
    return new Uint8Array(new ContentInfo({ contentType: "1.2.840.113549.1.7.2", content: cms.toSchema(true) }).toSchema().toBER(false));
  }
  return { root, leaf, crl, sign };
}

test("autorização de uso único: sessão, clínica, documento, expiração, código e limite de tentativas", () => {
  const scope = { organizationId: "org", userId: "user", documentId: "document", sessionHash: "session" };
  const ceremony = { ...scope, state: "open", attempts: 0, expiresAt: new Date(now.getTime() + 60_000) };
  assert.doesNotThrow(() => assertCeremony(scope, ceremony, now));
  for (const change of [{ organizationId: "other" }, { userId: "other" }, { documentId: "other" },
    { sessionHash: "different-login" }, { state: "consumed" }, { state: "processing" }, { attempts: 5 }, { expiresAt: now }]) {
    assert.throws(() => assertCeremony(scope, { ...ceremony, ...change }, now));
  }
  const hash = bytesHash("ceremony:123456");
  assert.ok(matchesSignatureCode("ceremony", "123456", hash));
  assert.ok(!matchesSignatureCode("other", "123456", hash));
  assert.ok(!matchesSignatureCode("ceremony", "000000", hash));
  assert.ok(!matchesSignatureCode("ceremony", "123456", "malformed"));
});

test("consultas PKI recusam SSRF, endereços privados, redirecionamento indireto e protocolos indevidos", async () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "100.100.100.200", "192.168.1.1", "::1", "::ffff:127.0.0.1", "fc00::1", "2001:db8::1"]) assert.equal(isPublicPkiAddress(address), false, address);
  assert.ok(isPublicPkiAddress("8.8.8.8")); assert.ok(isPublicPkiAddress("2606:4700:4700::1111"));
  for (const url of ["file:///etc/passwd", "http://127.0.0.1/crl", "https://user:pass@example.com/crl", "http://example.com:8080/crl"]) await assert.rejects(() => downloadPublicPki(url));
});

test("cadeia, CPF otherName e LCR reais com CA sintética: nenhum certificado de teste entra na confiança de produção", async () => {
  const { root, leaf, crl } = await fixture();
  const leafDer = new Uint8Array(encode(leaf)), rootDer = new Uint8Array(encode(root));
  assert.equal(personalCertificateIdentity(leaf).signerCpf, "52998224725");
  assert.ok(validCpf("52998224725")); assert.equal(validCpf("11111111111"), false);
  const input = { certificateDer: leafDer, untrustedChain: [leafDer, rootDer], at: now };
  const goodCrl = await crl();
  // Root injection only in this isolated test instance; production roots are pinned ITI bytes.
  const validator = new IcpBrasilTrustValidator([rootDer], async () => goodCrl);
  const result = await validator.validate(input);
  assert.equal(result.outcome, "valid");
  for (const [bytes, expected] of [[await crl(true), "invalid"], [await crl(false, true), "unavailable"], [await crl(false, false, true), "unavailable"]] as const) {
    assert.equal((await new IcpBrasilTrustValidator([rootDer], async () => bytes).validate(input)).outcome, expected);
  }
  assert.equal((await new IcpBrasilTrustValidator([rootDer], async () => { throw new Error("offline"); }).validate(input)).outcome, "unavailable");
  assert.equal((await new IcpBrasilTrustValidator(roots.map(item => Buffer.from(item.derBase64, "base64")), async () => goodCrl).validate(input)).outcome, "invalid");
  assert.equal((await validator.validate({ ...input, at: new Date(now.getTime() + 2 * 86400_000) })).outcome, "invalid");
  for (const item of roots) {
    const bytes = Buffer.from(item.derBase64, "base64");
    assert.equal(createHash("sha256").update(bytes).digest("hex"), item.fingerprint);
    assert.ok(item.source.startsWith("https://acraiz.icpbrasil.gov.br/"));
  }
});

test("ciclo integrado: PDF imutável, CMS, confiança, identidade, persistência e replay", async () => {
  const { root, crl, sign } = await fixture();
  const raw = await PDFDocument.create(); raw.addPage().drawText("Receituario SINTETICO, sem finalidade clinica");
  const original = await preparePadesPdf(await raw.save());
  const signed = embedDetachedCms(original, await sign(original));
  const originalHash = bytesHash(original);
  const trust = new IcpBrasilTrustValidator([new Uint8Array(encode(root))], async () => crl());
  const validator = new QualifiedPadesValidator(trust, new Set(["2.16.76.1.2.1.999"]));
  const files = new Map<string, Uint8Array>();
  let request: SignatureRequest | null = null, signedKey = "", finishes = 0;
  const input = { organizationId: "org", documentId: "doc", professionalId: "professional", userId: "user",
    signerCpf: "52998224725", idempotencyKey: "ceremony-unique", pdf: original };
  const service = new SignatureService({ provider: { name: "test-local-real-crypto", method: "local_a1", simulated: false,
    async start() { return { id: "local-request" }; }, async getStatus() { return { status: "COMPLETED", pdf: signed }; } },
    authorization: { async assertCanSign(value) { assert.equal(value.documentHash, originalHash); assert.equal(value.userId, "user"); } },
    storage: { async put(_org, key, bytes) { files.set(key, Uint8Array.from(bytes)); }, async get(_org, key) { return files.get(key)!; } },
    repository: { async findByKey() { return request; }, async find() { return request; }, async createOrGet(value) { request ??= value; return request; },
      async attachProvider(_org, _id, providerId) { request!.providerId = providerId; return true; },
      async finish(_org, _id, status, evidence) { if (request!.status !== "PENDING") return false; request!.status = status; signedKey = evidence.signedKey ?? ""; finishes++; return true; } }, validator });
  const started = await service.start(input);
  await service.reconcile("org", started.id);
  assert.equal((request as SignatureRequest | null)?.status, "SIGNED");
  assert.ok(Buffer.from(files.get(signedKey)!).equals(Buffer.from(signed)));
  assert.equal(bytesHash(files.get(signedKey)!), bytesHash(signed));
  await service.reconcile("org", started.id);
  assert.equal(finishes, 1);
  await assert.rejects(() => service.start({ ...input, signerCpf: "11111111111" }), /idempotente/);
  const otherDoc = await PDFDocument.create(); otherDoc.addPage().drawText("Outro documento");
  const other = await preparePadesPdf(await otherDoc.save());
  assert.equal((await validator.validate(embedDetachedCms(other, await sign(original)), bytesHash(other))).outcome, "invalid");
});
