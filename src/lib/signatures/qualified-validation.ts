import { X509Certificate } from "node:crypto";
import { verifyDetachedPades } from "./cms-verification";
import type { SignatureValidator, ValidationResult } from "./types";

export type TrustResult = { outcome: "unavailable" } | { outcome: "invalid" } | {
  outcome: "valid";
  certificateFingerprint: string;
  signerCpf: string;
  icpBrasil: boolean;
  revocation: "good" | "unknown" | "revoked";
  policyOid: string;
  checkedAt: Date;
};

/** Must independently verify CPF in ICP otherName, trusted ICP anchors, certificate
 * path, policy and current revocation. Embedded certificates are untrusted inputs.
 * The local pilot uses IcpBrasilTrustValidator; acceptance with a real certificate
 * remains mandatory before releasing this profile for clinical production. */
export interface CertificateTrustValidator {
  validate(input: { certificateDer: Uint8Array; untrustedChain: Uint8Array[]; at: Date }): Promise<TrustResult>;
}

/** Shared local/cloud single-signature PAdES profile. Never trusts provider status alone. */
export class QualifiedPadesValidator implements SignatureValidator {
  constructor(private readonly trust: CertificateTrustValidator,
    private readonly allowedPolicies: ReadonlySet<string>, private readonly now = () => new Date()) {
    if (!allowedPolicies.size) throw new Error("Configure as políticas ICP-Brasil homologadas.");
  }

  async validate(pdf: Uint8Array, originalHash: string): Promise<ValidationResult> {
    let verified;
    try { verified = await verifyDetachedPades(pdf, originalHash); }
    catch { return { outcome: "invalid", code: "cryptographic_validation_failed" }; }
    const at = this.now();
    const certificate = new X509Certificate(verified.certificateDer);
    if (!Number.isFinite(at.getTime()) || at < new Date(certificate.validFrom) || at >= new Date(certificate.validTo)) {
      return { outcome: "invalid", code: "certificate_outside_validity" };
    }
    let result: TrustResult;
    try { result = await this.trust.validate({ certificateDer: verified.certificateDer, untrustedChain: verified.embeddedCertificatesDer, at: new Date(at) }); }
    catch { return { outcome: "unavailable" }; }
    if (result.outcome === "unavailable") return result;
    if (result.outcome !== "valid" || !result.icpBrasil || result.revocation === "revoked" ||
      result.certificateFingerprint !== verified.certificateFingerprint || !/^\d{11}$/.test(result.signerCpf) ||
      !this.allowedPolicies.has(result.policyOid)) return { outcome: "invalid", code: "certificate_trust_rejected" };
    if (result.revocation !== "good" || !(result.checkedAt instanceof Date) || !Number.isFinite(result.checkedAt.getTime()) ||
      result.checkedAt > at || at.getTime() - result.checkedAt.getTime() > 5 * 60_000) return { outcome: "unavailable" };
    return { outcome: "valid", qualified: true, signerCpf: result.signerCpf, certificateFingerprint: verified.certificateFingerprint };
  }
}
