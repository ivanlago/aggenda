"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { clientHistoryEntries, clients, documentTemplates, electronicDocumentEvents, electronicDocuments } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { createDocumentCredentials, matchesHash, renderDocumentTemplate, sha256 } from "@/lib/electronic-documents";
import { sendElectronicDocumentEmail } from "@/lib/email";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const allowedTypes = new Set(["consent", "contract", "anamnesis", "term"]);

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://www.aggenda.app.br").replace(/\/$/, "");
}

export async function createDocumentTemplate(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "documents.manage");
  const name = text(data, "name").slice(0, 120);
  const title = text(data, "title").slice(0, 180);
  const content = text(data, "content").slice(0, 30_000);
  const documentType = text(data, "documentType");
  if (name.length < 2 || title.length < 2 || content.length < 20 || !allowedTypes.has(documentType)) {
    return { error: "Informe nome, tipo, título e conteúdo válido para o modelo." };
  }
  const [created] = await db.insert(documentTemplates).values({
    organizationId: organization.id, createdByUserId: session.user.id, name, title, content, documentType,
  }).returning({ id: documentTemplates.id });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "create", entityType: "document_template", entityId: created.id });
  revalidatePath("/documentos");
}

export async function setDocumentTemplateActive(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "documents.manage");
  const id = text(data, "id");
  const isActive = text(data, "active") === "true";
  await db.update(documentTemplates).set({ isActive, updatedAt: new Date() }).where(and(eq(documentTemplates.id, id), eq(documentTemplates.organizationId, organization.id)));
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: isActive ? "activate" : "deactivate", entityType: "document_template", entityId: id });
  revalidatePath("/documentos");
}

export async function issueElectronicDocument(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "documents.manage");
  const clientId = text(data, "clientId");
  const templateId = text(data, "templateId");
  const [client] = await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, organization.id))).limit(1);
  const [template] = await db.select().from(documentTemplates).where(and(eq(documentTemplates.id, templateId), eq(documentTemplates.organizationId, organization.id), eq(documentTemplates.isActive, true))).limit(1);
  if (!client || !template) return { error: "Cliente ou modelo não encontrado." };
  const signerEmail = text(data, "signerEmail") || client.email || "";
  if (!/^\S+@\S+\.\S+$/.test(signerEmail)) return { error: "Informe um e-mail válido para confirmar a identidade do signatário." };
  const signerName = text(data, "signerName") || client.name;
  const now = new Date();
  const credentials = createDocumentCredentials();
  const contentSnapshot = renderDocumentTemplate(template.content, {
    cliente: client.name,
    clinica: organization.name,
    data: now.toLocaleDateString("pt-BR", { timeZone: organization.timezone }),
  });
  const [created] = await db.insert(electronicDocuments).values({
    organizationId: organization.id,
    clientId: client.id,
    templateId: template.id,
    createdByUserId: session.user.id,
    documentType: template.documentType,
    title: renderDocumentTemplate(template.title, { cliente: client.name, clinica: organization.name }),
    contentSnapshot,
    contentHash: sha256(contentSnapshot),
    signerName,
    signerEmail,
    accessTokenHash: credentials.tokenHash,
    verificationCodeHash: credentials.codeHash,
    verificationExpiresAt: new Date(now.getTime() + 30 * 60_000),
    tokenExpiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60_000),
  }).returning({ id: electronicDocuments.id, title: electronicDocuments.title });
  await db.insert(electronicDocumentEvents).values({ organizationId: organization.id, documentId: created.id, eventType: "created", details: { channel: "email" } });
  try {
    await sendElectronicDocumentEmail({
      email: signerEmail, signerName, organizationName: organization.name, documentTitle: created.title,
      url: `${appUrl()}/assinar/${credentials.token}`, verificationCode: credentials.code, documentId: created.id,
    });
  } catch (error) {
    await db.insert(electronicDocumentEvents).values({ organizationId: organization.id, documentId: created.id, eventType: "delivery_failed", details: { message: error instanceof Error ? error.message : "Falha desconhecida" } });
    return { error: "Documento criado, mas o e-mail não foi enviado. Use reenviar após revisar a configuração do Resend." };
  }
  await db.insert(electronicDocumentEvents).values({ organizationId: organization.id, documentId: created.id, eventType: "sent", details: { channel: "email", recipient: signerEmail } });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "issue", entityType: "electronic_document", entityId: created.id, details: { clientId: client.id, channel: "email" } });
  revalidatePath("/documentos");
}

export async function resendElectronicDocument(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "documents.manage");
  const id = text(data, "id");
  const [document] = await db.select().from(electronicDocuments).where(and(eq(electronicDocuments.id, id), eq(electronicDocuments.organizationId, organization.id))).limit(1);
  if (!document || !["pending", "viewed", "expired"].includes(document.status)) return { error: "Este documento não pode ser reenviado." };
  const credentials = createDocumentCredentials();
  const now = new Date();
  await db.update(electronicDocuments).set({
    status: "pending", accessTokenHash: credentials.tokenHash, verificationCodeHash: credentials.codeHash,
    verificationExpiresAt: new Date(now.getTime() + 30 * 60_000), tokenExpiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60_000), verificationAttempts: 0, updatedAt: now,
  }).where(eq(electronicDocuments.id, document.id));
  await sendElectronicDocumentEmail({
    email: document.signerEmail, signerName: document.signerName, organizationName: organization.name,
    documentTitle: document.title, url: `${appUrl()}/assinar/${credentials.token}`, verificationCode: credentials.code, documentId: document.id,
  });
  await db.insert(electronicDocumentEvents).values({ organizationId: organization.id, documentId: document.id, eventType: "resent", details: { channel: "email" } });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "resend", entityType: "electronic_document", entityId: document.id });
  revalidatePath("/documentos");
}

export async function cancelElectronicDocument(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "documents.manage");
  const id = text(data, "id");
  const now = new Date();
  const result = await db.update(electronicDocuments).set({ status: "cancelled", cancelledAt: now, updatedAt: now }).where(and(eq(electronicDocuments.id, id), eq(electronicDocuments.organizationId, organization.id))).returning({ id: electronicDocuments.id });
  if (!result.length) return { error: "Documento não encontrado." };
  await db.insert(electronicDocumentEvents).values({ organizationId: organization.id, documentId: id, eventType: "cancelled", details: { userId: session.user.id } });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "cancel", entityType: "electronic_document", entityId: id });
  revalidatePath("/documentos");
}

export async function signElectronicDocument(_previous: { status: string; message: string }, data: FormData) {
  const token = text(data, "token");
  const code = text(data, "verificationCode").replace(/\D/g, "");
  const signatureData = text(data, "signatureData");
  const signerResponses = text(data, "signerResponses").slice(0, 20_000);
  const accepted = text(data, "accepted") === "on";
  if (!token || code.length !== 6 || !accepted || !signatureData.startsWith("data:image/png;base64,") || signatureData.length > 350_000) {
    return { status: "error", message: "Confirme o aceite, o código de 6 dígitos e desenhe sua assinatura." };
  }
  const [document] = await db.select().from(electronicDocuments).where(eq(electronicDocuments.accessTokenHash, sha256(token))).limit(1);
  if (!document || !["pending", "viewed"].includes(document.status)) return { status: "error", message: "Documento indisponível ou já finalizado." };
  if (document.documentType === "anamnesis" && signerResponses.length < 2) return { status: "error", message: "Preencha as respostas da anamnese antes de assinar." };
  const now = new Date();
  if (document.tokenExpiresAt < now || document.verificationExpiresAt < now) return { status: "error", message: "O link ou código expirou. Solicite um novo envio à clínica." };
  if (document.verificationAttempts >= 5) return { status: "error", message: "Limite de tentativas excedido. Solicite um novo envio." };
  if (!matchesHash(code, document.verificationCodeHash)) {
    await db.update(electronicDocuments).set({ verificationAttempts: document.verificationAttempts + 1, updatedAt: now }).where(eq(electronicDocuments.id, document.id));
    return { status: "error", message: "Código de confirmação inválido." };
  }
  const requestHeaders = await headers();
  const ipAddress = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip");
  const userAgent = requestHeaders.get("user-agent");
  const acceptanceText = "Declaro que li, compreendi e concordo com o conteúdo integral deste documento e confirmo ser o signatário identificado.";
  const evidenceHash = sha256(JSON.stringify({ documentId: document.id, contentHash: document.contentHash, signerName: document.signerName, signerEmail: document.signerEmail, signedAt: now.toISOString(), ipAddress, userAgent, acceptanceText, signatureHash: sha256(signatureData), responsesHash: signerResponses ? sha256(signerResponses) : null }));
  await db.transaction(async (tx) => {
    await tx.update(electronicDocuments).set({ status: "signed", signedAt: now, signatureData, signerResponses: signerResponses || null, acceptanceText, signerIpAddress: ipAddress, signerUserAgent: userAgent, evidenceHash, updatedAt: now }).where(and(eq(electronicDocuments.id, document.id), eq(electronicDocuments.status, document.status)));
    await tx.insert(electronicDocumentEvents).values({ organizationId: document.organizationId, documentId: document.id, eventType: "signed", ipAddress, userAgent, details: { evidenceHash, verification: "email_otp" } });
    if (document.createdByUserId) await tx.insert(clientHistoryEntries).values({ organizationId: document.organizationId, clientId: document.clientId, authorUserId: document.createdByUserId, entryType: "signed_document", title: document.title, content: `Documento assinado eletronicamente. Hash de evidências: ${evidenceHash}` });
  });
  await writeAuditLog({ organizationId: document.organizationId, action: "signed", entityType: "electronic_document", entityId: document.id, details: { evidenceHash, verification: "email_otp" } });
  return { status: "success", message: "Documento assinado com sucesso. Você já pode baixar sua via em PDF." };
}
