import { hasOrganizationPermission } from "../permissions";
import type { SignatureAuthorization } from "./types";

export interface SignatureIdentityEvidence {
  organizationId: string;
  professionalId: string;
  userId: string;
  documentId: string;
  documentHash: string;
  cpf: string;
  authorizedAt: Date;
  expiresAt: Date;
}

export interface SignatureAuthorizationFacts {
  organizationId: string;
  userId: string;
  role: string;
  professionalUserId: string | null;
  professionalActive: boolean;
  documentProfessionalId: string | null;
  documentStatus: string;
  documentWorkflow: string;
  documentType: string;
  // Produced by a verified identity/step-up flow, never deserialized from a form.
  evidence: SignatureIdentityEvidence | null;
}

export function assertSignatureAuthorization(
  input: Parameters<SignatureAuthorization["assertCanSign"]>[0],
  facts: SignatureAuthorizationFacts,
  eligibleTypes: ReadonlySet<string>,
  now = new Date(),
): void {
  const evidence = facts.evidence;
  if (!hasOrganizationPermission(facts.role, "documents.sign") ||
      facts.organizationId !== input.organizationId || facts.userId !== input.userId ||
      !facts.professionalActive || facts.professionalUserId !== input.userId ||
      facts.documentProfessionalId !== input.professionalId || facts.documentStatus !== "issued" ||
      facts.documentWorkflow !== "professional_issue" || !eligibleTypes.has(facts.documentType) ||
      !evidence || evidence.organizationId !== input.organizationId || evidence.userId !== input.userId ||
      evidence.professionalId !== input.professionalId || evidence.documentId !== input.documentId ||
      evidence.documentHash !== input.documentHash || evidence.cpf !== input.signerCpf ||
      !Number.isFinite(evidence.authorizedAt.getTime()) || !Number.isFinite(evidence.expiresAt.getTime()) ||
      evidence.authorizedAt > now || now.getTime() - evidence.authorizedAt.getTime() > 5 * 60_000 ||
      evidence.expiresAt <= now) {
    throw new Error("Assinatura não autorizada para este profissional e documento.");
  }
}
