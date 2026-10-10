import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import type { db } from "@/db";
import { documentArtifacts, documentSignatureEvents, documentSignatureRequests, electronicDocuments } from "@/db/schema";
import type { SignatureRepository, SignatureRequest, SignatureStatus } from "./types";

type Database = typeof db;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function findRequest(database: Database | Transaction, organizationId: string, value: string, byKey = false): Promise<SignatureRequest | null> {
  const [row] = await database.select({ request: documentSignatureRequests, original: documentArtifacts })
    .from(documentSignatureRequests).innerJoin(documentArtifacts, and(
      eq(documentArtifacts.id, documentSignatureRequests.originalArtifactId),
      eq(documentArtifacts.organizationId, documentSignatureRequests.organizationId),
      eq(documentArtifacts.documentId, documentSignatureRequests.documentId),
    )).where(and(eq(documentSignatureRequests.organizationId, organizationId),
      eq(byKey ? documentSignatureRequests.idempotencyKey : documentSignatureRequests.id, value))).limit(1);
  if (!row) return null;
  return {
    id: row.request.id, organizationId, documentId: row.request.documentId,
    professionalId: row.request.professionalId, userId: row.request.userId, signerCpf: row.request.signerCpf,
    idempotencyKey: row.request.idempotencyKey, inputHash: row.original.sha256,
    originalKey: row.original.storageKey, sizeBytes: row.original.sizeBytes,
    provider: row.request.provider, providerId: row.request.providerId, status: row.request.status as SignatureStatus,
  };
}

export class PostgresSignatureRepository implements SignatureRepository {
  constructor(private readonly database: Database) {}

  findByKey(organizationId: string, key: string) { return findRequest(this.database, organizationId, key, true); }
  find(organizationId: string, id: string) { return findRequest(this.database, organizationId, id); }

  async createOrGet(request: SignatureRequest): Promise<SignatureRequest> {
    return this.database.transaction(async (tx) => {
      // Serialize starts for this document, including distinct idempotency keys.
      const [document] = await tx.select({ id: electronicDocuments.id, status: electronicDocuments.status })
        .from(electronicDocuments).where(and(eq(electronicDocuments.organizationId, request.organizationId),
          eq(electronicDocuments.id, request.documentId))).for("update");
      if (!document || document.status !== "issued") throw new Error("Documento não está disponível para assinatura profissional.");
      const existing = await findRequest(tx, request.organizationId, request.idempotencyKey, true);
      if (existing) return existing;
      const [pending] = await tx.select({ id: documentSignatureRequests.id }).from(documentSignatureRequests).where(and(
        eq(documentSignatureRequests.organizationId, request.organizationId),
        eq(documentSignatureRequests.documentId, request.documentId), eq(documentSignatureRequests.status, "PENDING"),
      )).limit(1);
      if (pending) throw new Error("Este documento já possui uma assinatura em andamento.");
      const artifactId = randomUUID();
      await tx.insert(documentArtifacts).values({ id: artifactId, organizationId: request.organizationId,
        documentId: request.documentId, kind: "original", storageKey: request.originalKey,
        sha256: request.inputHash, sizeBytes: request.sizeBytes });
      const inserted = await tx.insert(documentSignatureRequests).values({
        id: request.id, organizationId: request.organizationId, documentId: request.documentId,
        professionalId: request.professionalId, userId: request.userId, signerCpf: request.signerCpf,
        idempotencyKey: request.idempotencyKey, originalArtifactId: artifactId,
        provider: request.provider, status: "PENDING",
      }).onConflictDoNothing({ target: [documentSignatureRequests.organizationId, documentSignatureRequests.idempotencyKey] })
        .returning({ id: documentSignatureRequests.id });
      if (!inserted.length) {
        // A concurrent request for a different document claimed the same key.
        await tx.delete(documentArtifacts).where(eq(documentArtifacts.id, artifactId));
        const winner = await findRequest(tx, request.organizationId, request.idempotencyKey, true);
        if (!winner) throw new Error("Não foi possível recuperar a solicitação concorrente.");
        return winner;
      }
      await tx.insert(documentSignatureEvents).values({ organizationId: request.organizationId,
        requestId: request.id, eventType: "created" });
      return request;
    });
  }

  async attachProvider(organizationId: string, id: string, providerId: string): Promise<boolean> {
    if (!providerId) throw new Error("Identificador do provedor inválido.");
    return this.database.transaction(async (tx) => {
      const [updated] = await tx.update(documentSignatureRequests).set({ providerId, updatedAt: new Date() }).where(and(
        eq(documentSignatureRequests.organizationId, organizationId), eq(documentSignatureRequests.id, id),
        eq(documentSignatureRequests.status, "PENDING"),
        or(isNull(documentSignatureRequests.providerId), eq(documentSignatureRequests.providerId, providerId)),
      )).returning({ id: documentSignatureRequests.id });
      if (!updated) {
        const current = await findRequest(tx, organizationId, id);
        if (current?.status === "PENDING") throw new Error("O provedor retornou identificadores divergentes para a mesma solicitação.");
        return false;
      }
      await tx.insert(documentSignatureEvents).values({ organizationId, requestId: id,
        eventType: "provider_attached", externalEventId: `start:${providerId}` }).onConflictDoNothing();
      return true;
    });
  }

  async finish(organizationId: string, id: string, status: Exclude<SignatureStatus, "PENDING">,
    evidence: { code?: string; signedKey?: string; signedHash?: string; signedSizeBytes?: number; certificateFingerprint?: string }): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      const [request] = await tx.select().from(documentSignatureRequests).where(and(
        eq(documentSignatureRequests.organizationId, organizationId), eq(documentSignatureRequests.id, id),
      )).for("update");
      if (!request || request.status !== "PENDING") return false;
      let signedArtifactId: string | undefined;
      const now = new Date();
      if (status === "SIGNED") {
        if (request.provider === "mock" || !evidence.signedKey || !/^[a-f0-9]{64}$/.test(evidence.signedHash ?? "") ||
            !evidence.signedSizeBytes || evidence.signedSizeBytes < 1 || !evidence.certificateFingerprint) {
          throw new Error("Evidências de assinatura incompletas.");
        }
        const [artifact] = await tx.insert(documentArtifacts).values({ organizationId, documentId: request.documentId,
          kind: "signed", storageKey: evidence.signedKey, sha256: evidence.signedHash!, sizeBytes: evidence.signedSizeBytes,
        }).returning({ id: documentArtifacts.id });
        signedArtifactId = artifact.id;
      }
      await tx.update(documentSignatureRequests).set({ status, signedArtifactId,
        validatedAt: status === "SIGNED" ? now : null,
        certificateFingerprint: status === "SIGNED" ? evidence.certificateFingerprint : null,
        failureCode: status === "FAILED" ? evidence.code ?? "failed" : null, updatedAt: now,
      }).where(eq(documentSignatureRequests.id, id));
      await tx.insert(documentSignatureEvents).values({ organizationId, requestId: id,
        eventType: status.toLowerCase(), code: evidence.code });
      return true;
    });
  }

  async latest(organizationId: string, documentId: string) {
    const [request] = await this.database.select().from(documentSignatureRequests).where(and(
      eq(documentSignatureRequests.organizationId, organizationId), eq(documentSignatureRequests.documentId, documentId),
    )).orderBy(desc(documentSignatureRequests.createdAt), desc(documentSignatureRequests.id)).limit(1);
    return request ?? null;
  }

  async signedArtifact(organizationId: string, documentId: string, artifactId: string) {
    const [artifact] = await this.database.select().from(documentArtifacts).where(and(
      eq(documentArtifacts.organizationId, organizationId), eq(documentArtifacts.documentId, documentId),
      eq(documentArtifacts.id, artifactId), eq(documentArtifacts.kind, "signed"),
    )).limit(1);
    return artifact ?? null;
  }
}
