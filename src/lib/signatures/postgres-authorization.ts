import { and, eq } from "drizzle-orm";
import type { db } from "@/db";
import { electronicDocuments, organizationMembers, professionals } from "@/db/schema";
import { assertSignatureAuthorization, type SignatureIdentityEvidence } from "./authorization";
import type { SignatureAuthorization } from "./types";

export class PostgresSignatureAuthorization implements SignatureAuthorization {
  constructor(private readonly database: typeof db, private readonly context: {
    // This must read the authenticated server session, not request parameters.
    session: () => Promise<{ userId: string; organizationId: string }>;
    // Identity and explicit approval must be verified by the real signing method.
    evidence: () => Promise<SignatureIdentityEvidence | null>;
    eligibleTypes: ReadonlySet<string>;
  }) {}

  async assertCanSign(input: Parameters<SignatureAuthorization["assertCanSign"]>[0]): Promise<void> {
    const session = await this.context.session();
    if (session.organizationId !== input.organizationId || session.userId !== input.userId) {
      throw new Error("Assinatura não autorizada.");
    }
    const [member] = await this.database.select({ role: organizationMembers.role }).from(organizationMembers).where(and(
      eq(organizationMembers.organizationId, session.organizationId), eq(organizationMembers.userId, session.userId),
    )).limit(1);
    const [professional] = await this.database.select({ userId: professionals.userId, active: professionals.isActive })
      .from(professionals).where(and(eq(professionals.organizationId, session.organizationId), eq(professionals.id, input.professionalId))).limit(1);
    const [document] = await this.database.select().from(electronicDocuments).where(and(
      eq(electronicDocuments.organizationId, session.organizationId), eq(electronicDocuments.id, input.documentId),
    )).limit(1);
    if (!member || !professional || !document) throw new Error("Assinatura não autorizada.");
    assertSignatureAuthorization(input, {
      ...session, role: member.role, professionalUserId: professional.userId, professionalActive: professional.active,
      documentProfessionalId: document.issuerProfessionalId, documentStatus: document.status,
      documentWorkflow: document.workflowType, documentType: document.documentType,
      evidence: await this.context.evidence(),
    }, this.context.eligibleTypes);
  }
}
