"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { clientHistoryEntries, clients, documentTemplates, electronicDocumentEvents, electronicDocuments, professionals } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { createDocumentCredentials, matchesHash, renderDocumentTemplate, sha256 } from "@/lib/electronic-documents";
import { documentPresets } from "@/lib/document-presets";
import { anamnesisAnswersToText, isAnamnesisSchema, visibleAnamnesisFields, type AnamnesisAnswers } from "@/lib/anamnesis";
import { sendElectronicDocumentEmail, sendProfessionalDocumentEmail } from "@/lib/email";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const patientTypes = new Set(["consent", "contract", "anamnesis", "term"]);
const professionalTypes = new Set(["prescription", "report", "certificate", "declaration", "referral", "exam_request", "guidance"]);
const allowedTypes = new Set([...patientTypes, ...professionalTypes]);

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
  const workflowType = professionalTypes.has(documentType) ? "professional_issue" : "patient_signature";
  if (name.length < 2 || title.length < 2 || content.length < 20 || !allowedTypes.has(documentType)) {
    return { error: "Informe nome, tipo, título e conteúdo válido para o modelo." };
  }
  const [created] = await db.insert(documentTemplates).values({
    organizationId: organization.id, createdByUserId: session.user.id, name, title, content, documentType, workflowType,
  }).returning({ id: documentTemplates.id });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "create", entityType: "document_template", entityId: created.id });
  revalidatePath("/documentos");
}

export async function installDefaultDocumentTemplates() {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "documents.manage");
  const existing = await db.select({ name: documentTemplates.name }).from(documentTemplates).where(eq(documentTemplates.organizationId, organization.id));
  const names = new Set(existing.map((item) => item.name));
  const missing = documentPresets.filter((item) => !names.has(item.name));
  if (missing.length) await db.insert(documentTemplates).values(missing.map((item) => ({ ...item, organizationId: organization.id, createdByUserId: session.user.id, isSystemPreset: true })));
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "install_presets", entityType: "document_template", details: { count: missing.length } });
  revalidatePath("/documentos");
}

export async function restoreDefaultDocumentTemplates() {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "documents.manage");
  const existing = await db.select({ name: documentTemplates.name }).from(documentTemplates).where(eq(documentTemplates.organizationId, organization.id));
  const names = new Set(existing.map((item) => item.name));
  for (const preset of documentPresets) {
    if (names.has(preset.name)) {
      await db.update(documentTemplates).set({
        title: preset.title,
        content: preset.content,
        documentType: preset.documentType,
        workflowType: preset.workflowType,
        isActive: true,
        isSystemPreset: true,
        updatedAt: new Date(),
      }).where(and(eq(documentTemplates.organizationId, organization.id), eq(documentTemplates.name, preset.name)));
    } else {
      await db.insert(documentTemplates).values({ ...preset, organizationId: organization.id, createdByUserId: session.user.id, isSystemPreset: true });
    }
  }
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "restore_presets", entityType: "document_template", details: { count: documentPresets.length } });
  revalidatePath("/documentos");
}

export async function updateDocumentTemplate(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "documents.manage");
  const id = text(data, "id");
  const name = text(data, "name").slice(0, 120);
  const title = text(data, "title").slice(0, 180);
  const content = text(data, "content").slice(0, 30_000);
  if (!id || name.length < 2 || title.length < 2 || content.length < 20) return { error: "Informe nome, título e conteúdo válidos." };
  const [existing] = await db.select({ isSystemPreset: documentTemplates.isSystemPreset }).from(documentTemplates).where(and(eq(documentTemplates.id, id), eq(documentTemplates.organizationId, organization.id))).limit(1);
  if (!existing) return { error: "Modelo não encontrado." };
  if (existing.isSystemPreset) return { error: "Modelos nativos não podem ser editados. Duplique o modelo para personalizá-lo." };
  await db.update(documentTemplates).set({ name, title, content, isSystemPreset: false, updatedAt: new Date() }).where(and(eq(documentTemplates.id, id), eq(documentTemplates.organizationId, organization.id)));
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "update", entityType: "document_template", entityId: id });
  revalidatePath("/documentos");
}

export async function duplicateDocumentTemplate(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "documents.manage");
  const id = text(data, "id");
  const [source] = await db.select().from(documentTemplates).where(and(eq(documentTemplates.id, id), eq(documentTemplates.organizationId, organization.id))).limit(1);
  if (!source) return { error: "Modelo não encontrado." };
  const existing = await db.select({ name: documentTemplates.name }).from(documentTemplates).where(eq(documentTemplates.organizationId, organization.id));
  const names = new Set(existing.map((item) => item.name));
  let name = `${source.name} — cópia`;
  let suffix = 2;
  while (names.has(name)) name = `${source.name} — cópia ${suffix++}`;
  const [created] = await db.insert(documentTemplates).values({
    organizationId: organization.id,
    createdByUserId: session.user.id,
    name,
    documentType: source.documentType,
    title: source.title,
    content: source.content,
    workflowType: source.workflowType,
    responseSchema: source.responseSchema,
    schemaVersion: source.schemaVersion,
    serviceId: source.serviceId,
    isSystemPreset: false,
    isActive: true,
  }).returning({ id: documentTemplates.id });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "duplicate", entityType: "document_template", entityId: created.id, details: { sourceTemplateId: source.id } });
  revalidatePath("/documentos");
}

export async function issueProfessionalDocument(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "documents.manage");
  const clientId = text(data, "clientId");
  const templateId = text(data, "templateId");
  const professionalId = text(data, "professionalId");
  const deliveryMethod = ["print", "email", "whatsapp"].includes(text(data, "deliveryMethod")) ? text(data, "deliveryMethod") : "print";
  const [client] = await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, organization.id))).limit(1);
  const [professional] = await db.select().from(professionals).where(and(eq(professionals.id, professionalId), eq(professionals.organizationId, organization.id), eq(professionals.isActive, true))).limit(1);
  const [template] = await db.select().from(documentTemplates).where(and(eq(documentTemplates.id, templateId), eq(documentTemplates.organizationId, organization.id), eq(documentTemplates.isActive, true))).limit(1);
  if (!client || !professional || !template || template.workflowType !== "professional_issue") return { error: "Paciente, profissional ou modelo não encontrado." };
  const patientEmail = text(data, "patientEmail") || client.email || "";
  if (deliveryMethod === "email" && !/^\S+@\S+\.\S+$/.test(patientEmail)) return { error: "Cadastre ou informe um e-mail válido para o paciente." };
  const patientPhone = client.phone?.replace(/\D/g, "") ?? "";
  if (deliveryMethod === "whatsapp" && !patientPhone) return { error: "Cadastre o telefone do paciente antes de compartilhar pelo WhatsApp." };
  const now = new Date();
  const rawContent = text(data, "content");
  if (rawContent.length < 20 || rawContent.includes("[PREENCHER]")) {
    return { error: "Revise o conteúdo e substitua todos os campos [PREENCHER] antes de emitir." };
  }
  const values = { cliente: client.name, clinica: organization.name, profissional: professional.name, data: now.toLocaleDateString("pt-BR", { timeZone: organization.timezone }) };
  const contentSnapshot = renderDocumentTemplate(rawContent, values);
  let structuredData: Record<string, unknown> | null = null;
  const prescriptionData = text(data, "prescriptionData").slice(0, 30_000);
  if (template.documentType === "prescription" && prescriptionData) {
    try { structuredData = JSON.parse(prescriptionData) as Record<string, unknown>; } catch { return { error: "Os dados estruturados da receita são inválidos." }; }
  }
  const genericStructuredData = text(data, "structuredDocumentData").slice(0, 30_000);
  if (template.documentType === "exam_request" && genericStructuredData) {
    try { structuredData = JSON.parse(genericStructuredData) as Record<string, unknown>; } catch { return { error: "Os dados estruturados da solicitação são inválidos." }; }
  }
  const title = renderDocumentTemplate(text(data, "title") || template.title, values);
  const credentials = createDocumentCredentials();
  const contentHash = sha256(contentSnapshot);
  const evidenceHash = sha256(JSON.stringify({ organizationId: organization.id, professionalId: professional.id, clientId: client.id, templateId: template.id, contentHash, issuedAt: now.toISOString() }));
  const [created] = await db.insert(electronicDocuments).values({
    organizationId: organization.id, clientId: client.id, templateId: template.id, createdByUserId: session.user.id,
    issuerProfessionalId: professional.id, workflowType: "professional_issue", documentType: template.documentType, title, contentSnapshot, contentHash,
    status: "issued", signerName: professional.name, signerEmail: professional.email || session.user.email, structuredData,
    accessTokenHash: credentials.tokenHash, verificationCodeHash: credentials.codeHash,
    verificationExpiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60_000), tokenExpiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60_000),
    issuedAt: now, evidenceHash,
  }).returning({ id: electronicDocuments.id });
  await db.insert(electronicDocumentEvents).values({ organizationId: organization.id, documentId: created.id, eventType: "issued", details: { professionalId: professional.id } });
  if (["prescription", "exam_request"].includes(template.documentType) && text(data, "saveToRecord") === "true") {
    await db.insert(clientHistoryEntries).values({ organizationId: organization.id, clientId: client.id, authorUserId: session.user.id, electronicDocumentId: created.id, entryType: template.documentType, title, content: contentSnapshot, occurredAt: now });
  }
  let deliveryWarning: string | undefined;
  if (deliveryMethod === "email") {
    try {
      await sendProfessionalDocumentEmail({ email: patientEmail, patientName: client.name, organizationName: organization.name, professionalName: professional.name, documentTitle: title, url: `${appUrl()}/api/public/documents/${credentials.token}/pdf`, documentId: created.id });
      await db.insert(electronicDocumentEvents).values({ organizationId: organization.id, documentId: created.id, eventType: "sent", details: { channel: "email", recipient: patientEmail } });
    } catch (error) {
      await db.insert(electronicDocumentEvents).values({ organizationId: organization.id, documentId: created.id, eventType: "delivery_failed", details: { message: error instanceof Error ? error.message : "Falha desconhecida" } });
      deliveryWarning = "Documento emitido e disponível na lista, mas o e-mail não foi enviado.";
    }
  }
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "issue", entityType: "professional_document", entityId: created.id, details: { professionalId: professional.id, clientId: client.id, deliveryMethod } });
  revalidatePath("/documentos");
  if (deliveryWarning) return { warning: deliveryWarning };
  if (deliveryMethod === "print") return { openUrl: `/api/documents/${created.id}/pdf?v=${created.id}` };
  if (deliveryMethod === "whatsapp") {
    const to = patientPhone.startsWith("55") ? patientPhone : `55${patientPhone}`;
    const publicUrl = `${appUrl()}/api/public/documents/${credentials.token}/pdf`;
    const message = `${client.name}, a ${organization.name} enviou o documento ${title}, emitido por ${professional.name}: ${publicUrl}`;
    return { openUrl: `https://wa.me/${to}?text=${encodeURIComponent(message)}` };
  }
}

export async function setDocumentTemplateActive(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "documents.manage");
  const id = text(data, "id");
  const isActive = text(data, "active") === "true";
  const [existing] = await db.select({ isSystemPreset: documentTemplates.isSystemPreset }).from(documentTemplates).where(and(eq(documentTemplates.id, id), eq(documentTemplates.organizationId, organization.id))).limit(1);
  if (!existing) return { error: "Modelo não encontrado." };
  if (existing.isSystemPreset) return { error: "Modelos nativos permanecem sempre ativos." };
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
  let deliveryWarning: string | undefined;
  try {
    await sendElectronicDocumentEmail({
      email: signerEmail, signerName, organizationName: organization.name, documentTitle: created.title,
      url: `${appUrl()}/assinar/${credentials.token}`, verificationCode: credentials.code, documentId: created.id,
    });
  } catch (error) {
    await db.insert(electronicDocumentEvents).values({ organizationId: organization.id, documentId: created.id, eventType: "delivery_failed", details: { message: error instanceof Error ? error.message : "Falha desconhecida" } });
    deliveryWarning = "Documento criado e disponível na lista, mas o e-mail não foi enviado. Revise a configuração e use reenviar.";
  }
  if (!deliveryWarning) await db.insert(electronicDocumentEvents).values({ organizationId: organization.id, documentId: created.id, eventType: "sent", details: { channel: "email", recipient: signerEmail } });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "issue", entityType: "electronic_document", entityId: created.id, details: { clientId: client.id, channel: "email" } });
  revalidatePath("/documentos");
  if (deliveryWarning) return { warning: deliveryWarning };
}

export async function resendElectronicDocument(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "documents.manage");
  const id = text(data, "id");
  const [document] = await db.select().from(electronicDocuments).where(and(eq(electronicDocuments.id, id), eq(electronicDocuments.organizationId, organization.id))).limit(1);
  if (!document || !["pending", "viewed", "expired"].includes(document.status)) return { error: "Este documento não pode ser reenviado." };
  const credentials = createDocumentCredentials();
  const now = new Date();
  try {
    await sendElectronicDocumentEmail({
      email: document.signerEmail, signerName: document.signerName, organizationName: organization.name,
      documentTitle: document.title, url: `${appUrl()}/assinar/${credentials.token}`, verificationCode: credentials.code, documentId: document.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida no envio";
    await db.insert(electronicDocumentEvents).values({ organizationId: organization.id, documentId: document.id, eventType: "delivery_failed", details: { channel: "email", recipient: document.signerEmail, message } });
    return { error: message.includes("RESEND_API_KEY") ? "O serviço de e-mail ainda não está configurado. Configure a RESEND_API_KEY ou crie uma nova anamnese usando Preencher agora." : "Não foi possível reenviar o e-mail. Tente novamente mais tarde." };
  }
  await db.update(electronicDocuments).set({
    status: "pending", accessTokenHash: credentials.tokenHash, verificationCodeHash: credentials.codeHash,
    verificationExpiresAt: new Date(now.getTime() + 30 * 60_000), tokenExpiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60_000), verificationAttempts: 0, updatedAt: now,
  }).where(eq(electronicDocuments.id, document.id));
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
  let anamnesisAnswers: AnamnesisAnswers | null = null;
  const responseSchema = document.structuredData?.schema;
  if (document.documentType === "anamnesis") {
    try { anamnesisAnswers = JSON.parse(signerResponses) as AnamnesisAnswers; } catch { return { status: "error", message: "As respostas da anamnese são inválidas." }; }
    if (!isAnamnesisSchema(responseSchema)) return { status: "error", message: "O modelo desta anamnese é inválido. Solicite um novo envio." };
    const missing = visibleAnamnesisFields(responseSchema, anamnesisAnswers).some((field) => field.required && (!anamnesisAnswers?.[field.id] || (Array.isArray(anamnesisAnswers[field.id]) && !anamnesisAnswers[field.id].length)));
    if (missing) return { status: "error", message: "Preencha todas as perguntas obrigatórias antes de assinar." };
  }
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
    const structuredData = anamnesisAnswers ? { ...document.structuredData, answers: anamnesisAnswers, answeredAt: now.toISOString() } : document.structuredData;
    const storedResponses = anamnesisAnswers && isAnamnesisSchema(responseSchema) ? anamnesisAnswersToText(responseSchema, anamnesisAnswers) : signerResponses || null;
    await tx.update(electronicDocuments).set({ status: "signed", signedAt: now, signatureData, signerResponses: storedResponses, structuredData, acceptanceText, signerIpAddress: ipAddress, signerUserAgent: userAgent, evidenceHash, updatedAt: now }).where(and(eq(electronicDocuments.id, document.id), eq(electronicDocuments.status, document.status)));
    await tx.insert(electronicDocumentEvents).values({ organizationId: document.organizationId, documentId: document.id, eventType: "signed", ipAddress, userAgent, details: { evidenceHash, verification: "email_otp" } });
    if (document.createdByUserId) await tx.insert(clientHistoryEntries).values({ organizationId: document.organizationId, clientId: document.clientId, authorUserId: document.createdByUserId, electronicDocumentId: document.id, entryType: document.documentType === "anamnesis" ? "anamnesis" : "signed_document", title: document.title, content: `Documento assinado eletronicamente. Hash de evidências: ${evidenceHash}` });
  });
  await writeAuditLog({ organizationId: document.organizationId, action: "signed", entityType: "electronic_document", entityId: document.id, details: { evidenceHash, verification: "email_otp" } });
  return { status: "success", message: "Documento assinado com sucesso. Você já pode baixar sua via em PDF." };
}
