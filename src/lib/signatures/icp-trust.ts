import { createHash, webcrypto } from "node:crypto";
import * as asn1 from "asn1js";
import { Certificate, CertificateChainValidationEngine, CertificateRevocationList, CryptoEngine,
  AltName, CertificatePolicies, CRLDistributionPoints } from "pkijs";
import type { CertificateTrustValidator, TrustResult } from "./qualified-validation";
import { downloadPublicPki } from "./public-download";

const engine = new CryptoEngine({ name: "AggendaICP", crypto: webcrypto as unknown as Crypto });
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const der = (certificate: Certificate) => new Uint8Array(certificate.toSchema().toBER(false));
const policyPrefixes = ["2.16.76.1.2.1.", "2.16.76.1.2.3."]; // Personal A1/A3 certificate policies only.

export function validCpf(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1+$/.test(cpf)) return false;
  for (let length = 9; length <= 10; length++) {
    const sum = [...cpf.slice(0, length)].reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const digit = (sum * 10) % 11;
    if ((digit === 10 ? 0 : digit) !== Number(cpf[length])) return false;
  }
  return true;
}

export function personalCertificateIdentity(certificate: Certificate) {
  const sanExtension = certificate.extensions?.find(item => item.extnID === "2.5.29.17");
  const policiesExtension = certificate.extensions?.find(item => item.extnID === "2.5.29.32");
  if (!sanExtension || !policiesExtension) throw new Error("Certificado pessoal sem CPF ou política.");
  const san = new AltName({ schema: asn1.fromBER(sanExtension.extnValue.valueBlock.valueHexView).result });
  const values: string[] = [];
  for (const name of san.altNames) {
    if (name.type !== 0 || !(name.value instanceof asn1.Constructed)) continue;
    const [oid, wrapped] = name.value.valueBlock.value;
    if (!(oid instanceof asn1.ObjectIdentifier) || oid.valueBlock.toString() !== "2.16.76.1.3.1" ||
        !(wrapped instanceof asn1.Constructed) || wrapped.valueBlock.value.length !== 1) continue;
    const value = wrapped.valueBlock.value[0];
    const text = value instanceof asn1.OctetString ? Buffer.from(value.valueBlock.valueHexView).toString("ascii") :
      "value" in value.valueBlock ? String(value.valueBlock.value) : "";
    // ICP otherName: birthdate (8) followed by CPF (11). Never infer CPF from CN.
    if (/^\d{19}/.test(text) && validCpf(text.slice(8, 19))) values.push(text.slice(8, 19));
  }
  if (values.length !== 1) throw new Error("CPF ausente ou ambíguo no certificado.");
  // An e-CNPJ also carries the representative's CPF; explicitly refuse company certificates.
  if (san.altNames.some(name => name.type === 0 && name.value instanceof asn1.Constructed &&
      name.value.valueBlock.value[0] instanceof asn1.ObjectIdentifier &&
      name.value.valueBlock.value[0].valueBlock.toString() === "2.16.76.1.3.3")) throw new Error("Use e-CPF, não e-CNPJ.");
  const policies = new CertificatePolicies({ schema: asn1.fromBER(policiesExtension.extnValue.valueBlock.valueHexView).result });
  const policyOid = policies.certificatePolicies.map(item => item.policyIdentifier).find(oid => policyPrefixes.some(prefix => oid.startsWith(prefix)));
  if (!policyOid) throw new Error("Política pessoal A1/A3 não suportada.");
  return { signerCpf: values[0], policyOid };
}

/** Anchors are shipped from the official ITI repository, never from the uploaded CMS.
 * Full base CRLs only; delta/indirect/scoped CRLs and OCSP-only issuers fail closed. */
export class IcpBrasilTrustValidator implements CertificateTrustValidator {
  constructor(private readonly roots: Uint8Array[], private readonly download = downloadPublicPki) {
    if (!roots.length) throw new Error("Âncoras ICP-Brasil não configuradas.");
  }
  async validate(input: Parameters<CertificateTrustValidator["validate"]>[0]): Promise<TrustResult> {
    if (input.untrustedChain.length > 8 || input.certificateDer.length > 32768 || !Number.isFinite(input.at.getTime())) return { outcome: "invalid" };
    let certificate: Certificate;
    let identity: ReturnType<typeof personalCertificateIdentity>;
    let path: Certificate[];
    try {
      certificate = Certificate.fromBER(Uint8Array.from(input.certificateDer).buffer);
      identity = personalCertificateIdentity(certificate);
      const trustedCerts = this.roots.map(root => Certificate.fromBER(Uint8Array.from(root).buffer));
      const certs = input.untrustedChain.filter(bytes => digest(bytes) !== digest(input.certificateDer))
        .map(bytes => Certificate.fromBER(Uint8Array.from(bytes).buffer));
      certs.push(certificate); // PKI.js target is the last certificate.
      const result = await new CertificateChainValidationEngine({ trustedCerts, certs, checkDate: input.at })
        .verify({ passedWhenNotRevValues: true }, engine);
      if (!result.result || !result.certificatePath?.length) return { outcome: "invalid" };
      path = result.certificatePath;
      const anchor = path[path.length - 1];
      if (!trustedCerts.some(root => digest(der(root)) === digest(der(anchor))) || path.length < 2) return { outcome: "invalid" };
      const keyUsage = certificate.extensions?.find(item => item.extnID === "2.5.29.15");
      const bits = keyUsage ? asn1.fromBER(keyUsage.extnValue.valueBlock.valueHexView).result : null;
      if (!(bits instanceof asn1.BitString) || !(bits.valueBlock.valueHexView[0] & 0xc0)) return { outcome: "invalid" };
    } catch { return { outcome: "invalid" }; }
    try {
      for (let index = 0; index < path.length - 1; index++) {
        const leaf = path[index], issuer = path[index + 1];
        const extension = leaf.extensions?.find(item => item.extnID === "2.5.29.31");
        if (!extension) return { outcome: "unavailable" };
        const points = new CRLDistributionPoints({ schema: asn1.fromBER(extension.extnValue.valueBlock.valueHexView).result });
        const urls = points.distributionPoints.filter(point => !point.reasons && !point.cRLIssuer)
          .flatMap(point => Array.isArray(point.distributionPoint) ? point.distributionPoint : [])
          .filter(name => name.type === 6 && typeof name.value === "string").map(name => String(name.value)).slice(0, 2);
        let checked = false;
        for (const url of urls) {
          try {
            const crl = CertificateRevocationList.fromBER(Uint8Array.from(await this.download(url)).buffer);
            if (!crl.issuer.isEqual(issuer.subject) || !crl.nextUpdate || crl.thisUpdate.value > input.at ||
                crl.nextUpdate.value <= input.at || crl.crlExtensions?.extensions.some(ext =>
                  ext.extnID === "2.5.29.27" || ext.extnID === "2.5.29.28" || (ext.critical && ext.extnID !== "2.5.29.35")) ||
                !await crl.verify({ issuerCertificate: issuer }, engine)) continue;
            if (crl.revokedCertificates?.some(item => item.userCertificate.isEqual(leaf.serialNumber))) return { outcome: "invalid" };
            checked = true;
            break;
          } catch { /* Another published distribution point may be available. */ }
        }
        if (!checked) return { outcome: "unavailable" };
      }
      return { outcome: "valid", ...identity, certificateFingerprint: digest(input.certificateDer), icpBrasil: true,
        revocation: "good", checkedAt: input.at };
    } catch { return { outcome: "unavailable" }; }
  }
}
