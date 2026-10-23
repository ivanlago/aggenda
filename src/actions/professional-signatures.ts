"use server";

import { randomInt, randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { clients, commercialUsage, electronicDocuments, electronicDocumentEvents, documentSignatureEvents, documentSignatureRequests, professionals, professionalSigningCeremonies, professionalSigningIdentities } from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { assertOrganizationPermission } from "@/lib/permissions";
import { sendProfessionalSignatureCode, sendProfessionalDocumentEmail } from "@/lib/email";
import { createDocumentCredentials } from "@/lib/electronic-documents";
import { storedSignaturePdf } from "@/lib/signatures/document-download";
import { writeAuditLog } from "@/lib/audit";
import { reserveCommercialUsage } from "@/lib/commercial-access";
import { createQualifiedSignatureService } from "@/lib/signatures/runtime";
import { professionalSigningContext, professionalSnapshotPdf } from "@/lib/signatures/professional-context";
import { signatureStorage } from "@/lib/signatures/storage-config";
import { localSignatureReadiness, localTrustValidator } from "@/lib/signatures/local-config";
import { assertCeremony, bytesHash, localEligibleTypes, localProviderName, matchesSignatureCode } from "@/lib/signatures/local-policy";
import { validCpf } from "@/lib/signatures/icp-trust";
import { embedDetachedCms, preparePadesPdf } from "@/lib/signatures/pades";
import { verifyDetachedPades } from "@/lib/signatures/cms-verification";
import { PostgresSignatureRepository } from "@/lib/signatures/postgres-repository";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const refresh = () => { revalidatePath("/documentos/historico"); revalidatePath("/documentos/assinatura-profissional"); };

export async function registerProfessionalSigningIdentity(form: FormData) {
  const { organization, session } = await requireOrganization();
  assertOrganizationPermission(organization.role, "team.manage");
  const cpf = text(form, "cpf").replace(/\D/g, ""), professionalId = text(form, "professionalId");
  if (!validCpf(cpf) || text(form, "verified") !== "on") return { error: "Confira a identidade e informe um CPF válido do profissional." };
  await db.transaction(async tx => {
    const [professional] = await tx.select().from(professionals).where(and(eq(professionals.organizationId, organization.id), eq(professionals.id, professionalId))).for("update");
    if (!professional?.userId || !professional.isActive) throw new Error("Vincule um usuário ao profissional ativo antes de cadastrar sua identidade.");
    await tx.insert(professionalSigningIdentities).values({ organizationId: organization.id, professionalId, cpf, verifiedBy: session.user.id })
      .onConflictDoUpdate({ target: [professionalSigningIdentities.organizationId, professionalSigningIdentities.professionalId], set: { cpf, verifiedBy: session.user.id, updatedAt: new Date() } });
    // Changing identity invalidates all outstanding authorizations.
    await tx.update(professionalSigningCeremonies).set({ state: "cancelled" }).where(and(eq(professionalSigningCeremonies.organizationId, organization.id), eq(professionalSigningCeremonies.professionalId, professionalId), eq(professionalSigningCeremonies.state, "open")));
  });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "verify_identity", entityType: "professional_signing_identity", entityId: professionalId });
  refresh();
}

export async function prepareProfessionalSignature(form: FormData) {
  const context = await professionalSigningContext(text(form, "documentId"));
  const { organization, session, document, professional, cpf } = context;
  const readiness = localSignatureReadiness(organization.id);
  if (!readiness.ready) return { error: readiness.message };
  if (!cpf) return { error: "Peça ao administrador da clínica para conferir e cadastrar seu CPF para assinatura." };
  const repository = new PostgresSignatureRepository(db);
  const latest = await repository.latest(organization.id, document.id);
  if (latest?.status === "SIGNED" || latest?.status === "PENDING") return { error: "Este documento já possui uma assinatura concluída ou em validação." };
  const id = randomUUID(), code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const pdf = await PDFDocument.load(await professionalSnapshotPdf(context));
  pdf.setKeywords([`Aggenda autorização ${id}`]); // Fresh signed nonce: a previous CMS cannot authorize this ceremony.
  const prepared = await preparePadesPdf(await pdf.save());
  const originalHash = bytesHash(prepared), originalKey = `signatures/ceremonies/${id}/prepared.pdf`;
  await db.transaction(async tx => {
    // A per-professional lock prevents concurrent starts bypassing the email rate limit.
    await tx.select({ id: professionals.id }).from(professionals).where(eq(professionals.id, professional.id)).for("update");
    const recent = await tx.select({ id: professionalSigningCeremonies.id }).from(professionalSigningCeremonies).where(and(
      eq(professionalSigningCeremonies.organizationId, organization.id), eq(professionalSigningCeremonies.userId, session.user.id),
      gt(professionalSigningCeremonies.createdAt, new Date(Date.now() - 60 * 60_000))));
    if (recent.length >= 5) throw new Error("Limite de cinco autorizações por hora. Aguarde antes de solicitar outro código.");
    await tx.update(professionalSigningCeremonies).set({ state: "cancelled" }).where(and(eq(professionalSigningCeremonies.organizationId, organization.id), eq(professionalSigningCeremonies.documentId, document.id), eq(professionalSigningCeremonies.state, "open")));
    await tx.insert(professionalSigningCeremonies).values({ id, organizationId: organization.id, documentId: document.id,
      professionalId: professional.id, userId: session.user.id, sessionHash: bytesHash(session.session.id), signerCpf: cpf, originalKey, originalHash,
      otpHash: bytesHash(`${id}:${code}`), expiresAt: new Date(Date.now() + 20 * 60_000) });
  });
  try {
    await signatureStorage().put(organization.id, originalKey, prepared);
    await sendProfessionalSignatureCode({ email: session.user.email, code, title: document.title, ceremonyId: id, documentHash: originalHash });
  }
  catch {
    await db.update(professionalSigningCeremonies).set({ state: "cancelled" }).where(eq(professionalSigningCeremonies.id, id));
    return { error: "Não foi possível preparar a assinatura ou enviar o código. Confira o armazenamento e o e-mail antes de tentar novamente." };
  }
  refresh();
}

export async function completeProfessionalSignature(form: FormData) {
  const context = await professionalSigningContext(text(form, "documentId"));
  const { organization, session, document, professional, cpf } = context;
  const readiness = localSignatureReadiness(organization.id);
  if (!readiness.ready) return { error: readiness.message };
  const id = text(form, "ceremonyId"), code = text(form, "code");
  const cms = form.get("cms");
  if (!(cms instanceof File) || !cms.size || cms.size > 32768 || !cms.name.toLowerCase().endsWith(".p7s") || text(form, "consent") !== "on") return { error: "Anexe o arquivo .p7s e confirme a autorização." };
  const claim = await db.transaction(async tx => {
    const [ceremony] = await tx.select().from(professionalSigningCeremonies).where(and(eq(professionalSigningCeremonies.id, id),
      eq(professionalSigningCeremonies.organizationId, organization.id), eq(professionalSigningCeremonies.userId, session.user.id))).for("update");
    if (!ceremony) throw new Error("Autorização não encontrada.");
    // A serverless interruption must not strand the exchange forever. Only the
    // same ceremony/hash can retry after the maximum invocation duration.
    if (ceremony.state === "processing" && ceremony.processingStartedAt && ceremony.processingStartedAt.getTime() < Date.now() - 150_000) ceremony.state = "open";
    assertCeremony({ organizationId: organization.id, userId: session.user.id, documentId: document.id, sessionHash: bytesHash(session.session.id) }, ceremony);
    if (ceremony.signerCpf !== cpf || ceremony.professionalId !== professional.id) throw new Error("A identidade do profissional foi alterada. Prepare novamente.");
    if (!matchesSignatureCode(id, code, ceremony.otpHash)) {
      await tx.update(professionalSigningCeremonies).set({ attempts: ceremony.attempts + 1 }).where(eq(professionalSigningCeremonies.id, id));
      return null;
    }
    await tx.update(professionalSigningCeremonies).set({ state: "processing", processingStartedAt: new Date(), attempts: ceremony.attempts + 1 }).where(eq(professionalSigningCeremonies.id, id));
    return ceremony;
  });
  if (!claim) return { error: "Código incorreto. Após cinco tentativas será necessário preparar uma nova assinatura." };
  let consumed = false;
  try {
    const original = await signatureStorage().get(organization.id, claim.originalKey);
    if (bytesHash(original) !== claim.originalHash) throw new Error("Falha de integridade no documento preparado.");
    const signed = embedDetachedCms(original, new Uint8Array(await cms.arrayBuffer()));
    const verified = await verifyDetachedPades(signed, claim.originalHash);
    const trust = localTrustValidator();
    const trustResult = await trust.validate({ certificateDer: verified.certificateDer, untrustedChain: verified.embeddedCertificatesDer, at: new Date() });
    if (trustResult.outcome === "unavailable") return { error: "A consulta de revogação está indisponível. Nenhuma assinatura foi aprovada. Tente novamente com este arquivo enquanto o código estiver válido." };
    if (trustResult.outcome !== "valid" || trustResult.signerCpf !== cpf) throw new Error("Certificado inválido, revogado, não confiável ou de outro titular.");
    const at = new Date();
    const evidence = { organizationId: organization.id, userId: session.user.id, documentId: document.id,
      professionalId: professional.id, documentHash: claim.originalHash, cpf: trustResult.signerCpf, authorizedAt: at, expiresAt: claim.expiresAt };
    const provider = { name: localProviderName, method: "local_a1" as const, simulated: false,
      async start() { return { id: claim.id }; }, async getStatus() { return { status: "COMPLETED" as const, pdf: signed }; } };
    const service = createQualifiedSignatureService({ provider, trust, allowedPolicies: new Set([trustResult.policyOid]),
      evidence: async () => {
        const [identity] = await db.select().from(professionalSigningIdentities).where(and(eq(professionalSigningIdentities.organizationId, organization.id), eq(professionalSigningIdentities.professionalId, professional.id)));
        return identity?.cpf === evidence.cpf ? evidence : null;
      }, eligibleTypes: localEligibleTypes });
    const request = await service.start({ organizationId: organization.id, documentId: document.id, professionalId: professional.id,
      userId: session.user.id, signerCpf: trustResult.signerCpf, idempotencyKey: `local:${id}`, pdf: original });
    await db.transaction(async tx => { await reserveCommercialUsage(tx, organization.id, "documents", `professional:${document.id}`); });
    await service.reconcile(organization.id, request.id);
    const result = await new PostgresSignatureRepository(db).find(organization.id, request.id);
    if (result?.status !== "SIGNED") return { error: "Assinatura aguardando validação. Reenvie o mesmo arquivo para consultar novamente." };
    await db.transaction(async tx => {
      await tx.update(professionalSigningCeremonies).set({ state: "consumed", requestId: request.id }).where(eq(professionalSigningCeremonies.id, id));
      await tx.update(commercialUsage).set({ state: "committed" }).where(and(eq(commercialUsage.organizationId, organization.id), eq(commercialUsage.metric, "documents"), eq(commercialUsage.resourceId, `professional:${document.id}`)));
    });
    consumed = true;
    await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "qualified_signed", entityType: "electronic_document", entityId: document.id,
      details: { requestId: request.id, certificateFingerprint: verified.certificateFingerprint } });
    refresh();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const publicMessages = ["Certificado inválido, revogado, não confiável ou de outro titular.",
      "Falha de integridade no documento preparado.", "Franquia esgotada. Consulte Plano e cobrança antes de iniciar novas operações.",
      "Seu período de acesso terminou. Consulte Plano e cobrança.", "Assinatura não autorizada para este profissional e documento."];
    return { error: publicMessages.includes(message) ? message : "Não foi possível validar a assinatura. Confira se o .p7s foi gerado para este PDF, com seu e-CPF, e tente novamente." };
  } finally {
    if (!consumed) await db.update(professionalSigningCeremonies).set({ state: "open", processingStartedAt: null }).where(and(eq(professionalSigningCeremonies.id, id), eq(professionalSigningCeremonies.state, "processing")));
  }
}

export async function cancelProfessionalSignature(form: FormData) {
  const { organization, session, document } = await professionalSigningContext(text(form, "documentId"));
  await db.transaction(async tx => {
    const [ceremony] = await tx.select().from(professionalSigningCeremonies).where(and(eq(professionalSigningCeremonies.id, text(form, "ceremonyId")),
      eq(professionalSigningCeremonies.organizationId, organization.id), eq(professionalSigningCeremonies.documentId, document.id), eq(professionalSigningCeremonies.userId, session.user.id))).for("update");
    if (!ceremony || (ceremony.state !== "open" && !(ceremony.state === "processing" && ceremony.processingStartedAt && ceremony.processingStartedAt.getTime() < Date.now() - 150_000))) throw new Error("Autorização indisponível para cancelamento.");
    await tx.update(professionalSigningCeremonies).set({ state: "cancelled" }).where(eq(professionalSigningCeremonies.id, ceremony.id));
    // Cancels only this file exchange, never revokes an already-produced signature.
    const cancelled = await tx.update(documentSignatureRequests).set({ status: "CANCELLED", updatedAt: new Date() }).where(and(
      eq(documentSignatureRequests.organizationId, organization.id), eq(documentSignatureRequests.idempotencyKey, `local:${ceremony.id}`), eq(documentSignatureRequests.status, "PENDING"))).returning({ id: documentSignatureRequests.id });
    if (cancelled.length) await tx.insert(documentSignatureEvents).values({ organizationId: organization.id, requestId: cancelled[0].id,
      eventType: "cancelled", code: "local_authorization_cancelled" });
  });
  refresh();
}

export async function sendQualifiedDocumentToPatient(form: FormData) {
  const { organization, session, document, professional } = await professionalSigningContext(text(form, "documentId"));
  if (!await storedSignaturePdf(organization.id, document.id)) return { error: "Conclua a assinatura antes de enviar o documento." };
  const [patient] = await db.select({ email: clients.email, name: clients.name }).from(clients).where(and(eq(clients.organizationId, organization.id), eq(clients.id, document.clientId))).limit(1);
  if (!patient?.email || !/^\S+@\S+\.\S+$/.test(patient.email)) return { error: "Cadastre o e-mail do paciente antes de enviar." };
  const credentials = createDocumentCredentials();
  await db.transaction(async tx => {
    await tx.select({ id: electronicDocuments.id }).from(electronicDocuments).where(eq(electronicDocuments.id, document.id)).for("update");
    const recent = await tx.select({ id: electronicDocumentEvents.id }).from(electronicDocumentEvents).where(and(
      eq(electronicDocumentEvents.organizationId, organization.id), eq(electronicDocumentEvents.documentId, document.id),
      eq(electronicDocumentEvents.eventType, "qualified_delivery_requested"), gt(electronicDocumentEvents.createdAt, new Date(Date.now() - 10 * 60_000))));
    if (recent.length) throw new Error("Aguarde dez minutos antes de reenviar este documento.");
    await tx.update(electronicDocuments).set({ accessTokenHash: credentials.tokenHash, tokenExpiresAt: new Date(Date.now() + 7 * 86400_000) }).where(eq(electronicDocuments.id, document.id));
    await tx.insert(electronicDocumentEvents).values({ organizationId: organization.id, documentId: document.id, eventType: "qualified_delivery_requested" });
  });
  try {
    await sendProfessionalDocumentEmail({ email: patient.email, patientName: patient.name, organizationName: organization.name,
      professionalName: professional.name, documentTitle: document.title,
      url: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.aggenda.app.br"}/api/public/documents/${credentials.token}/pdf`, documentId: `${document.id}:${credentials.tokenHash.slice(0, 12)}` });
  } catch { return { error: "O envio falhou. O PDF assinado permanece disponível. Confira o serviço de e-mail antes de tentar novamente." }; }
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "send_qualified_document", entityType: "electronic_document", entityId: document.id });
  refresh();
}
