import { createHash, webcrypto } from "node:crypto";
import * as asn1 from "asn1js";
import { ContentInfo, CryptoEngine, SignedData } from "pkijs";
import { assertPadesBinding, inspectPreparedPdf } from "./pades";

const engine = new CryptoEngine({ name: "AggendaNode", crypto: webcrypto as unknown as Crypto });
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export interface VerifiedCms {
  certificateDer: Uint8Array;
  embeddedCertificatesDer: Uint8Array[];
  certificateFingerprint: string;
}

/** Cryptographic check only. A successful result does NOT establish ICP qualification,
 * CPF ownership, certificate validity, trusted chain, policy, or revocation status. */
export async function verifyDetachedPades(pdf: Uint8Array, originalHash: string): Promise<VerifiedCms> {
  assertPadesBinding(pdf, originalHash);
  const parsed = inspectPreparedPdf(pdf);
  const bytes = Buffer.from(parsed.pdf.toString("ascii", parsed.length + 1, parsed.tail - 1), "hex");
  const decoded = asn1.fromBER(Uint8Array.from(bytes).buffer);
  if (decoded.offset === -1 || bytes.subarray(decoded.offset).some(byte => byte !== 0)) {
    throw new Error("CMS malformado ou conteúdo excedente.");
  }
  const container = new ContentInfo({ schema: decoded.result });
  if (container.contentType !== "1.2.840.113549.1.7.2") throw new Error("CMS não é SignedData.");
  const signed = new SignedData({ schema: container.content });
  if (signed.signerInfos.length !== 1 || signed.encapContentInfo.eContent ||
      signed.encapContentInfo.eContentType !== "1.2.840.113549.1.7.1") {
    throw new Error("Esperado CMS destacado com um titular.");
  }
  const signer = signed.signerInfos[0];
  if (signer.digestAlgorithm.algorithmId !== "2.16.840.1.101.3.4.2.1" || !signer.signedAttrs) {
    throw new Error("Esperados SHA-256 e atributos assinados.");
  }
  const attributes = signer.signedAttrs.attributes;
  for (const oid of ["1.2.840.113549.1.9.3", "1.2.840.113549.1.9.4", "1.2.840.113549.1.9.16.2.47"]) {
    const matches = attributes.filter(attr => attr.type === oid);
    if (matches.length !== 1 || matches[0].values.length !== 1) throw new Error("Atributos CMS ausentes ou duplicados.");
  }
  const result = await signed.verify({ signer: 0, data: Uint8Array.from(parsed.content).buffer,
    checkChain: false, extendedMode: true }, engine);
  if (!result.signatureVerified || !result.signerCertificate) throw new Error("Assinatura CMS inválida.");
  const cert = new Uint8Array(result.signerCertificate.toSchema().toBER(false));
  const ess = attributes.find(attr => attr.type === "1.2.840.113549.1.9.16.2.47")!.values[0];
  // Restricted pilot profile: ESSCertIDv2 with default SHA-256 and one certificate.
  const match = asn1.compareSchema(ess, ess, new asn1.Sequence({ value: [new asn1.Sequence({ value: [
    new asn1.Sequence({ value: [new asn1.OctetString({ name: "certHash" })] }),
  ] })] }));
  if (!match.verified || sha256(cert) !== Buffer.from(match.result.certHash.valueBlock.valueHexView).toString("hex")) {
    throw new Error("Vínculo signingCertificateV2 inválido ou perfil não suportado.");
  }
  return { certificateDer: cert, certificateFingerprint: sha256(cert), embeddedCertificatesDer:
    (signed.certificates ?? []).filter(certificate => "subjectPublicKeyInfo" in certificate)
      .map(certificate => new Uint8Array(certificate.toSchema().toBER(false))) };
}
