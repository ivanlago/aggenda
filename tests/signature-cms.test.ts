import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import * as asn1 from "asn1js";
import { Attribute, AttributeTypeAndValue, Certificate, ContentInfo, CryptoEngine, EncapsulatedContentInfo,
  IssuerAndSerialNumber, SignedAndUnsignedAttributes, SignedData, SignerInfo } from "pkijs";
import { PDFDocument } from "pdf-lib";
import { embedDetachedCms, inspectPreparedPdf, preparePadesPdf } from "../src/lib/signatures/pades";
import { verifyDetachedPades } from "../src/lib/signatures/cms-verification";
import { QualifiedPadesValidator, type TrustResult } from "../src/lib/signatures/qualified-validation";

test("CMS real com certificado sintético: verifica criptografia e rejeita CMS e certificado adulterados", async () => {
  const engine = new CryptoEngine({ name: "test", crypto: webcrypto as unknown as Crypto });
  const keys = await webcrypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const cert = new Certificate();
  cert.version = 2;
  cert.serialNumber = new asn1.Integer({ value: 1 });
  const cn = new AttributeTypeAndValue({ type: "2.5.4.3", value: new asn1.Utf8String({ value: "TESTE SEM VALIDADE ICP" }) });
  cert.issuer.typesAndValues.push(cn);
  cert.subject.typesAndValues.push(cn);
  cert.notBefore.value = new Date(Date.now() - 60000);
  cert.notAfter.value = new Date(Date.now() + 60000);
  await cert.subjectPublicKeyInfo.importKey(keys.publicKey as CryptoKey, engine);
  await cert.sign(keys.privateKey as CryptoKey, "SHA-256", engine);
  const certBytes = cert.toSchema().toBER(false);
  const doc = await PDFDocument.create();
  doc.addPage().drawText("CMS sintético");
  const prepared = await preparePadesPdf(await doc.save());
  const parsed = inspectPreparedPdf(prepared);
  const digest = (bytes: Uint8Array) => Uint8Array.from(createHash("sha256").update(bytes).digest()).buffer;
  async function sign(wrongCertificateHash = false) {
    const cms = new SignedData({ version: 1, certificates: [cert], encapContentInfo:
      new EncapsulatedContentInfo({ eContentType: "1.2.840.113549.1.7.1" }), signerInfos: [new SignerInfo({ version: 1,
        sid: new IssuerAndSerialNumber({ issuer: cert.issuer, serialNumber: cert.serialNumber }),
        signedAttrs: new SignedAndUnsignedAttributes({ type: 0, attributes: [
          new Attribute({ type: "1.2.840.113549.1.9.3", values: [new asn1.ObjectIdentifier({ value: "1.2.840.113549.1.7.1" })] }),
          new Attribute({ type: "1.2.840.113549.1.9.4", values: [new asn1.OctetString({ valueHex: digest(parsed.content) })] }),
          new Attribute({ type: "1.2.840.113549.1.9.16.2.47", values: [new asn1.Sequence({ value: [new asn1.Sequence({ value: [
            new asn1.Sequence({ value: [new asn1.OctetString({ valueHex: wrongCertificateHash ? new ArrayBuffer(32) :
              digest(new Uint8Array(certBytes)) })] }),
          ] })] })] }),
        ] }),
      })] });
    await cms.sign(keys.privateKey as CryptoKey, 0, "SHA-256", parsed.content, engine);
    return new Uint8Array(new ContentInfo({ contentType: "1.2.840.113549.1.7.2", content: cms.toSchema(true) }).toSchema().toBER(false));
  }
  const cms = await sign();
  const result = await verifyDetachedPades(embedDetachedCms(prepared, cms), parsed.originalHash);
  assert.equal(result.certificateFingerprint, createHash("sha256").update(new Uint8Array(certBytes)).digest("hex"));
  // A self-signed certificate verifies mathematically but receives no ICP qualification.
  assert.equal("qualified" in result, false);
  const signedPdf = embedDetachedCms(prepared, cms);
  const checkedAt = new Date();
  // This trust double is deliberately NOT a production validator or ICP proof.
  const trusted: TrustResult = { outcome: "valid", certificateFingerprint: result.certificateFingerprint,
    signerCpf: "12345678901", icpBrasil: true, revocation: "good", policyOid: "test-policy", checkedAt };
  const validate = (trust: TrustResult) => new QualifiedPadesValidator({ async validate() { return trust; } },
    new Set(["test-policy"]), () => checkedAt).validate(signedPdf, parsed.originalHash);
  assert.equal((await validate(trusted)).outcome, "valid");
  for (const changed of [{ icpBrasil: false }, { revocation: "revoked" as const },
    { certificateFingerprint: "different" }, { policyOid: "unapproved" }, { signerCpf: "invalid" }]) {
    assert.equal((await validate({ ...trusted, ...changed })).outcome, "invalid");
  }
  for (const changed of [{ revocation: "unknown" as const }, { checkedAt: new Date(checkedAt.getTime() - 301_000) },
    { checkedAt: new Date(checkedAt.getTime() + 1) }]) {
    assert.equal((await validate({ ...trusted, ...changed })).outcome, "unavailable");
  }
  const unavailable = new QualifiedPadesValidator({ async validate() { throw new Error("offline"); } }, new Set(["test-policy"]));
  assert.equal((await unavailable.validate(signedPdf, parsed.originalHash)).outcome, "unavailable");
  assert.equal((await unavailable.validate(signedPdf, "a".repeat(64))).outcome, "invalid");
  const expired = new QualifiedPadesValidator({ async validate() { return trusted; } }, new Set(["test-policy"]),
    () => new Date(cert.notAfter.value.getTime() + 1000));
  assert.equal((await expired.validate(signedPdf, parsed.originalHash)).outcome, "invalid");
  const damaged = Uint8Array.from(cms);
  damaged[damaged.length - 1] ^= 1;
  await assert.rejects(() => verifyDetachedPades(embedDetachedCms(prepared, damaged), parsed.originalHash));
  const wrongCertificateCms = await sign(true);
  await assert.rejects(() => verifyDetachedPades(embedDetachedCms(prepared, wrongCertificateCms), parsed.originalHash));
});
