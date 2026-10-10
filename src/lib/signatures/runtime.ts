import { db } from "@/db";
import { requireOrganization } from "@/lib/session";
import type { SignatureIdentityEvidence } from "./authorization";
import { PostgresSignatureAuthorization } from "./postgres-authorization";
import { PostgresSignatureRepository } from "./postgres-repository";
import { signatureStorage } from "./storage-config";
import { SignatureService } from "./service";
import type { SignatureProvider, SignatureValidator } from "./types";

/** Real methods must be explicitly supplied; no mock or permissive validator fallback. */
export function createInternalSignatureService(options: {
  provider: SignatureProvider;
  validator: SignatureValidator;
  evidence: () => Promise<SignatureIdentityEvidence | null>;
  eligibleTypes: ReadonlySet<string>;
}) {
  if (options.provider.simulated) throw new Error("O provedor simulado é exclusivo dos testes.");
  return new SignatureService({
    provider: options.provider, validator: options.validator,
    repository: new PostgresSignatureRepository(db), storage: signatureStorage(),
    authorization: new PostgresSignatureAuthorization(db, {
      session: async () => {
        const { session, organization } = await requireOrganization();
        return { userId: session.user.id, organizationId: organization.id };
      },
      evidence: options.evidence, eligibleTypes: options.eligibleTypes,
    }),
  });
}
