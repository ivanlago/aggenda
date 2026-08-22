"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { clients, documentTemplates, electronicDocumentEvents, electronicDocuments, professionals } from "@/db/schema";
import { anamnesisPresets, isAnamnesisSchema, type AnamnesisField } from "@/lib/anamnesis";
import { writeAuditLog } from "@/lib/audit";
import { createDocumentCredentials, renderDocumentTemplate, sha256 } from "@/lib/electronic-documents";
import { sendElectronicDocumentEmail } from "@/lib/email";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "https://www.aggenda.app.br").replace(/\/$/, "");

export async function installAnamnesisTemplates() {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "documents.manage");
  const existing = await db.select({ name: documentTemplates.name }).from(documentTemplates).where(eq(documentTemplates.organizationId, organization.id));
  const names = new Set(existing.map((item) => item.name));
  const missing = anamnesisPresets.filter((preset) => !names.has(preset.name));
  if (missing.length) await db.insert(documentTemplates).values(missing.map((preset) => ({
    organizationId: organization.id,
    createdByUserId: session.user.id,
    name: preset.name,
    title: preset.title,
    content: "Responda às perguntas com atenção. Suas respostas serão registradas no prontuário e integradas ao documento assinado.",
    documentType: "anamnesis",
    workflowType: "patient_signature",
    responseSchema: [...preset.fields],
    schemaVersion: 1,
    isSystemPreset: true,
  })));
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "install_presets", entityType: "anamnesis_template", details: { count: missing.length } });
  revalidatePath("/documentos");
}

export async function createAnamnesisTemplate(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "documents.manage");
  const name = value(data, "name").slice(0, 120);
  const serviceId = value(data, "serviceId") || null;
  let schema: AnamnesisField[];
  try { schema = JSON.parse(value(data, "responseSchema")) as AnamnesisField[]; } catch { return { error: "Os campos do modelo são inválidos." }; }
  if (name.length < 2 || !isAnamnesisSchema(schema) || !schema.length) return { error: "Informe o nome e adicione ao menos uma pergunta." };
  if (serviceId) {
    const { services } = await import("@/db/schema");
    const [service] = await db.select({ id: services.id }).from(services).where(and(eq(services.id, serviceId), eq(services.organizationId, organization.id))).limit(1);
    if (!service) return { error: "O procedimento selecionado não foi encontrado." };
  }
  await db.insert(documentTemplates).values({ organizationId: organization.id, createdByUserId: session.user.id, name, title: name, content: "Responda às perguntas com atenção. As respostas serão anexadas à ficha assinada.", documentType: "anamnesis", workflowType: "patient_signature", responseSchema: schema, schemaVersion: 1, serviceId });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "create", entityType: "anamnesis_template", details: { fields: schema.length, serviceId } });
  revalidatePath("/documentos");
}

export async function issueAnamnesis(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "documents.manage");
  const clientId = value(data, "clientId");
  const templateId = value(data, "templateId");
  const professionalId = value(data, "professionalId") || null;
  const delivery = value(data, "delivery") === "fill_now" ? "fill_now" : "email";
  const [client] = await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, organization.id))).limit(1);
  const [template] = await db.select().from(documentTemplates).where(and(eq(documentTemplates.id, templateId), eq(documentTemplates.organizationId, organization.id), eq(documentTemplates.documentType, "anamnesis"), eq(documentTemplates.isActive, true))).limit(1);
  if (!client || !template || !isAnamnesisSchema(template.responseSchema)) return { error: "Paciente ou modelo de anamnese não encontrado." };
  if (!client.email && delivery === "email") return { error: "Cadastre o e-mail do paciente ou use Preencher agora." };
  if (professionalId) {
    const [professional] = await db.select({ id: professionals.id }).from(professionals).where(and(eq(professionals.id, professionalId), eq(professionals.organizationId, organization.id), eq(professionals.isActive, true))).limit(1);
    if (!professional) return { error: "Profissional responsável não encontrado." };
  }
  const now = new Date();
  const credentials = createDocumentCredentials();
  const contentSnapshot = renderDocumentTemplate(template.content, { cliente: client.name, clinica: organization.name, data: now.toLocaleDateString("pt-BR", { timeZone: organization.timezone }) });
  const structuredData = { kind: "anamnesis", schemaVersion: template.schemaVersion, schema: template.responseSchema, answers: {}, responsibleProfessionalId: professionalId, reviewedAt: null };
  const [created] = await db.insert(electronicDocuments).values({
    organizationId: organization.id, clientId: client.id, templateId: template.id, createdByUserId: session.user.id,
    issuerProfessionalId: professionalId, workflowType: "patient_signature", documentType: "anamnesis", title: template.title,
    contentSnapshot, contentHash: sha256(`${contentSnapshot}\n${JSON.stringify(template.responseSchema)}`), structuredData,
    signerName: client.name, signerEmail: client.email || "preenchimento.presencial@aggenda.local", accessTokenHash: credentials.tokenHash,
    verificationCodeHash: credentials.codeHash, verificationExpiresAt: new Date(now.getTime() + (delivery === "fill_now" ? 8 : 0.5) * 60 * 60_000), tokenExpiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60_000),
  }).returning({ id: electronicDocuments.id });
  await db.insert(electronicDocumentEvents).values({ organizationId: organization.id, documentId: created.id, eventType: "created", details: { delivery, schemaVersion: template.schemaVersion } });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "issue", entityType: "anamnesis", entityId: created.id, details: { clientId, professionalId, delivery } });
  revalidatePath("/documentos");
  const url = `${appUrl()}/assinar/${credentials.token}`;
  if (delivery === "fill_now") return { openUrl: `/assinar/${credentials.token}?code=${credentials.code}` };
  try {
    await sendElectronicDocumentEmail({ email: client.email!, signerName: client.name, organizationName: organization.name, documentTitle: template.title, url, verificationCode: credentials.code, documentId: created.id });
    await db.insert(electronicDocumentEvents).values({ organizationId: organization.id, documentId: created.id, eventType: "sent", details: { channel: "email", recipient: client.email } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida no envio";
    await db.insert(electronicDocumentEvents).values({ organizationId: organization.id, documentId: created.id, eventType: "delivery_failed", details: { channel: "email", recipient: client.email, message } });
    return { warning: message.includes("RESEND_API_KEY") ? "Anamnese criada, mas o serviço de e-mail ainda não está configurado. Use Preencher agora ou configure a RESEND_API_KEY." : "Anamnese criada, mas o e-mail não foi enviado. Ela permanece disponível na lista para reenvio." };
  }
}

export async function reviewAnamnesis(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "documents.manage");
  const id = value(data, "id");
  const professionalId = value(data, "professionalId");
  const [professional] = await db.select({ id: professionals.id }).from(professionals).where(and(eq(professionals.id, professionalId), eq(professionals.organizationId, organization.id), eq(professionals.isActive, true))).limit(1);
  const [document] = await db.select().from(electronicDocuments).where(and(eq(electronicDocuments.id, id), eq(electronicDocuments.organizationId, organization.id), eq(electronicDocuments.documentType, "anamnesis"), eq(electronicDocuments.status, "signed"))).limit(1);
  if (!professional || !document) return { error: "Anamnese assinada ou profissional não encontrado." };
  const current = document.structuredData ?? {};
  if (current.reviewedAt) return { error: "Esta anamnese já foi revisada." };
  const reviewedAt = new Date();
  await db.update(electronicDocuments).set({ issuerProfessionalId: professional.id, structuredData: { ...current, reviewedAt: reviewedAt.toISOString(), reviewedByProfessionalId: professional.id }, updatedAt: reviewedAt }).where(eq(electronicDocuments.id, document.id));
  await db.insert(electronicDocumentEvents).values({ organizationId: organization.id, documentId: document.id, eventType: "reviewed", details: { professionalId: professional.id } });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "review", entityType: "anamnesis", entityId: document.id, details: { professionalId: professional.id } });
  revalidatePath("/documentos");
  revalidatePath(`/clientes/${document.clientId}`);
}
