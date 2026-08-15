"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  clients,
  chatConversations,
  chatMessages,
  crmAiInsights,
  crmCustomFields,
  crmCustomFieldValues,
  crmLeadTags,
  crmLeads,
  crmOpportunities,
  crmPipelines,
  crmProposalItems,
  crmProposals,
  crmStages,
  crmTags,
  crmTasks,
  financialEntries,
} from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string) {
  return text(formData, key) || null;
}

function money(formData: FormData, key: string) {
  const raw = text(formData, key).replace(/\s/g, "");
  if (!raw) return null;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) throw new Error("Informe um valor válido.");
  return Math.round(value * 100);
}

function localDateTime(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Informe uma data válida.");
  return parsed;
}

export async function initializeCrm() {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "crm.manage");
  const [existing] = await db.select({ id: crmPipelines.id }).from(crmPipelines)
    .where(eq(crmPipelines.organizationId, organization.id)).limit(1);
  if (existing) return;
  await db.transaction(async (tx) => {
    const [pipeline] = await tx.insert(crmPipelines).values({
      organizationId: organization.id,
      name: "Funil comercial",
      isDefault: true,
    }).returning({ id: crmPipelines.id });
    await tx.insert(crmStages).values([
      { organizationId: organization.id, pipelineId: pipeline.id, name: "Novo contato", position: 1, probability: 10 },
      { organizationId: organization.id, pipelineId: pipeline.id, name: "Qualificado", position: 2, probability: 30 },
      { organizationId: organization.id, pipelineId: pipeline.id, name: "Demonstração", position: 3, probability: 50 },
      { organizationId: organization.id, pipelineId: pipeline.id, name: "Proposta", position: 4, probability: 70 },
      { organizationId: organization.id, pipelineId: pipeline.id, name: "Negociação", position: 5, probability: 85 },
    ]);
  });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "crm.initialized", entityType: "crm_pipeline" });
  revalidatePath("/crm");
}

export async function createCrmLead(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "crm.manage");
  const name = text(formData, "name");
  if (name.length < 2) throw new Error("Informe o nome do lead.");
  const pipelineId = text(formData, "pipelineId");
  const stageId = text(formData, "stageId");
  const title = text(formData, "title") || `Oportunidade de ${name}`;
  const [stage] = await db.select({ id: crmStages.id, pipelineId: crmStages.pipelineId })
    .from(crmStages).where(and(eq(crmStages.id, stageId), eq(crmStages.organizationId, organization.id))).limit(1);
  if (!stage || stage.pipelineId !== pipelineId) throw new Error("Etapa do funil inválida.");
  const [lead] = await db.transaction(async (tx) => {
    const inserted = await tx.insert(crmLeads).values({
      organizationId: organization.id,
      assignedUserId: optional(formData, "assignedUserId") || session.user.id,
      name,
      phone: optional(formData, "phone"),
      email: optional(formData, "email"),
      company: optional(formData, "company"),
      source: text(formData, "source") || "manual",
      notes: optional(formData, "notes"),
    }).returning({ id: crmLeads.id });
    await tx.insert(crmOpportunities).values({
      organizationId: organization.id,
      leadId: inserted[0].id,
      pipelineId,
      stageId,
      assignedUserId: optional(formData, "assignedUserId") || session.user.id,
      title,
      valueInCents: money(formData, "value"),
      source: text(formData, "source") || "manual",
      expectedCloseDate: optional(formData, "expectedCloseDate"),
      nextActionAt: localDateTime(text(formData, "nextActionAt")),
    });
    return inserted;
  });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "crm.lead.created", entityType: "crm_lead", entityId: lead.id, details: { source: text(formData, "source") || "manual" } });
  revalidatePath("/crm");
}

export async function moveCrmOpportunity(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "crm.manage");
  const opportunityId = text(formData, "opportunityId");
  const stageId = text(formData, "stageId");
  const [stage] = await db.select({ id: crmStages.id, pipelineId: crmStages.pipelineId }).from(crmStages)
    .where(and(eq(crmStages.id, stageId), eq(crmStages.organizationId, organization.id))).limit(1);
  const [opportunity] = await db.select({ id: crmOpportunities.id, pipelineId: crmOpportunities.pipelineId }).from(crmOpportunities)
    .where(and(eq(crmOpportunities.id, opportunityId), eq(crmOpportunities.organizationId, organization.id))).limit(1);
  if (!stage || !opportunity || stage.pipelineId !== opportunity.pipelineId) throw new Error("Movimentação inválida.");
  await db.update(crmOpportunities).set({ stageId, updatedAt: new Date() }).where(eq(crmOpportunities.id, opportunityId));
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "crm.opportunity.moved", entityType: "crm_opportunity", entityId: opportunityId, details: { stageId } });
  revalidatePath("/crm");
}

export async function closeCrmOpportunity(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "crm.manage");
  const id = text(formData, "opportunityId");
  const status = text(formData, "status");
  if (status !== "won" && status !== "lost") throw new Error("Situação inválida.");
  const [item] = await db.select({ id: crmOpportunities.id }).from(crmOpportunities)
    .where(and(eq(crmOpportunities.id, id), eq(crmOpportunities.organizationId, organization.id))).limit(1);
  if (!item) throw new Error("Oportunidade não encontrada.");
  await db.update(crmOpportunities).set({
    status,
    lostReason: status === "lost" ? optional(formData, "lostReason") : null,
    closedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(crmOpportunities.id, id));
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: `crm.opportunity.${status}`, entityType: "crm_opportunity", entityId: id });
  revalidatePath("/crm");
}

export async function createCrmTask(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "crm.manage");
  const title = text(formData, "title");
  const dueAt = localDateTime(text(formData, "dueAt"));
  if (title.length < 2 || !dueAt) throw new Error("Informe tarefa e prazo.");
  const [task] = await db.insert(crmTasks).values({
    organizationId: organization.id,
    leadId: optional(formData, "leadId"),
    opportunityId: optional(formData, "opportunityId"),
    assignedUserId: optional(formData, "assignedUserId") || session.user.id,
    createdByUserId: session.user.id,
    type: (text(formData, "type") || "follow_up") as "follow_up" | "call" | "message" | "meeting" | "proposal" | "other",
    title,
    notes: optional(formData, "notes"),
    dueAt,
  }).returning({ id: crmTasks.id });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "crm.task.created", entityType: "crm_task", entityId: task.id });
  revalidatePath("/crm");
}

export async function completeCrmTask(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "crm.manage");
  const id = text(formData, "taskId");
  await db.update(crmTasks).set({ completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(crmTasks.id, id), eq(crmTasks.organizationId, organization.id)));
  revalidatePath("/crm");
}

export async function convertCrmLeadToClient(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "crm.manage");
  const leadId = text(formData, "leadId");
  const [lead] = await db.select().from(crmLeads).where(and(eq(crmLeads.id, leadId), eq(crmLeads.organizationId, organization.id))).limit(1);
  if (!lead) throw new Error("Lead não encontrado.");
  if (lead.clientId) return;
  const [client] = await db.transaction(async (tx) => {
    const existing = lead.phone ? await tx.select({ id: clients.id }).from(clients)
      .where(and(eq(clients.organizationId, organization.id), eq(clients.phone, lead.phone))).limit(1) : [];
    const created = existing.length ? existing : await tx.insert(clients).values({
      organizationId: organization.id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      notes: lead.notes,
    }).returning({ id: clients.id });
    await tx.update(crmLeads).set({ clientId: created[0].id, status: "converted", convertedAt: new Date(), updatedAt: new Date() }).where(eq(crmLeads.id, leadId));
    await tx.update(crmOpportunities).set({ clientId: created[0].id, updatedAt: new Date() }).where(and(eq(crmOpportunities.organizationId, organization.id), eq(crmOpportunities.leadId, leadId)));
    return created;
  });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "crm.lead.converted", entityType: "crm_lead", entityId: leadId, details: { clientId: client.id } });
  revalidatePath("/crm");
  revalidatePath("/clientes");
}

export async function createCrmLeadFromConversation(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "crm.manage");
  const conversationId = text(formData, "conversationId");
  const [conversation] = await db.select().from(chatConversations).where(and(
    eq(chatConversations.id, conversationId), eq(chatConversations.organizationId, organization.id)
  )).limit(1);
  if (!conversation) throw new Error("Conversa não encontrada.");
  if (conversation.leadId) return;
  const [pipeline] = await db.select({ id: crmPipelines.id }).from(crmPipelines)
    .where(eq(crmPipelines.organizationId, organization.id)).orderBy(desc(crmPipelines.isDefault)).limit(1);
  if (!pipeline) throw new Error("Crie o funil comercial antes de importar a conversa.");
  const [stage] = await db.select({ id: crmStages.id }).from(crmStages)
    .where(and(eq(crmStages.organizationId, organization.id), eq(crmStages.pipelineId, pipeline.id))).orderBy(asc(crmStages.position)).limit(1);
  if (!stage) throw new Error("O funil não possui etapas.");
  const [lead] = await db.transaction(async (tx) => {
    const created = await tx.insert(crmLeads).values({
      organizationId: organization.id,
      assignedUserId: session.user.id,
      name: conversation.contactName || conversation.externalContactId,
      phone: conversation.externalContactId,
      source: "whatsapp",
    }).returning({ id: crmLeads.id });
    const [opportunity] = await tx.insert(crmOpportunities).values({
      organizationId: organization.id,
      leadId: created[0].id,
      pipelineId: pipeline.id,
      stageId: stage.id,
      assignedUserId: session.user.id,
      title: `Atendimento de ${conversation.contactName || conversation.externalContactId}`,
      source: "whatsapp",
    }).returning({ id: crmOpportunities.id });
    await tx.update(chatConversations).set({
      leadId: created[0].id,
      opportunityId: opportunity.id,
      assignedUserId: session.user.id,
      updatedAt: new Date(),
    }).where(eq(chatConversations.id, conversationId));
    return created;
  });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "crm.conversation.imported", entityType: "crm_lead", entityId: lead.id, details: { conversationId } });
  revalidatePath("/crm"); revalidatePath("/crm/inbox");
}

export async function updateCrmHandoff(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "chat.inbox");
  const conversationId = text(formData, "conversationId");
  const status = text(formData, "status");
  if (!["bot", "requested", "human", "resolved"].includes(status)) throw new Error("Situação de atendimento inválida.");
  const [conversation] = await db.select({ id: chatConversations.id }).from(chatConversations).where(and(
    eq(chatConversations.id, conversationId), eq(chatConversations.organizationId, organization.id)
  )).limit(1);
  if (!conversation) throw new Error("Conversa não encontrada.");
  const now = new Date();
  await db.update(chatConversations).set({
    handoffStatus: status,
    handoffReason: optional(formData, "reason"),
    assignedUserId: optional(formData, "assignedUserId") || session.user.id,
    automationPaused: status === "requested" || status === "human",
    handoffRequestedAt: status === "requested" || status === "human" ? now : undefined,
    handoffResolvedAt: status === "resolved" || status === "bot" ? now : null,
    updatedAt: now,
  }).where(eq(chatConversations.id, conversationId));
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: `crm.handoff.${status}`, entityType: "chat_conversation", entityId: conversationId });
  revalidatePath("/crm/inbox");
}

export async function createCrmProposal(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "crm.manage");
  const opportunityId = text(formData, "opportunityId");
  const description = text(formData, "description");
  const quantity = Math.max(1, Math.trunc(Number(text(formData, "quantity") || "1")));
  const unitPrice = money(formData, "unitPrice");
  const discount = money(formData, "discount") ?? 0;
  if (!description || unitPrice == null) throw new Error("Informe o item e seu valor.");
  const [opportunity] = await db.select({ id: crmOpportunities.id, leadId: crmOpportunities.leadId, title: crmOpportunities.title }).from(crmOpportunities)
    .where(and(eq(crmOpportunities.id, opportunityId), eq(crmOpportunities.organizationId, organization.id))).limit(1);
  if (!opportunity) throw new Error("Oportunidade não encontrada.");
  const subtotal = quantity * unitPrice;
  if (discount > subtotal) throw new Error("O desconto não pode superar o subtotal.");
  const number = `PROP-${Date.now().toString(36).toUpperCase()}`;
  const [proposal] = await db.transaction(async (tx) => {
    const created = await tx.insert(crmProposals).values({
      organizationId: organization.id, opportunityId, createdByUserId: session.user.id,
      number, title: text(formData, "title") || opportunity.title, notes: optional(formData, "notes"),
      validUntil: optional(formData, "validUntil"), subtotalInCents: subtotal, discountInCents: discount,
      totalInCents: subtotal - discount,
    }).returning({ id: crmProposals.id });
    await tx.insert(crmProposalItems).values({
      organizationId: organization.id, proposalId: created[0].id,
      serviceId: optional(formData, "serviceId"), description, quantity,
      unitPriceInCents: unitPrice, totalInCents: subtotal,
    });
    return created;
  });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "crm.proposal.created", entityType: "crm_proposal", entityId: proposal.id, details: { opportunityId, totalInCents: subtotal - discount } });
  revalidatePath("/crm/propostas"); revalidatePath(`/crm/leads/${opportunity.leadId}`);
}

export async function updateCrmProposalStatus(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "crm.manage");
  const proposalId = text(formData, "proposalId");
  const status = text(formData, "status") as "draft" | "sent" | "accepted" | "rejected" | "expired";
  if (!["draft", "sent", "accepted", "rejected", "expired"].includes(status)) throw new Error("Situação inválida.");
  const [proposal] = await db.select({ id: crmProposals.id, opportunityId: crmProposals.opportunityId, totalInCents: crmProposals.totalInCents, title: crmProposals.title, clientId: crmOpportunities.clientId }).from(crmProposals)
    .innerJoin(crmOpportunities, eq(crmOpportunities.id, crmProposals.opportunityId)).where(and(eq(crmProposals.id, proposalId), eq(crmProposals.organizationId, organization.id))).limit(1);
  if (!proposal) throw new Error("Proposta não encontrada.");
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(crmProposals).set({ status, sentAt: status === "sent" ? now : undefined, acceptedAt: status === "accepted" ? now : undefined, rejectedAt: status === "rejected" ? now : undefined, updatedAt: now }).where(eq(crmProposals.id, proposalId));
    if (status === "accepted") {
      await tx.update(crmOpportunities).set({ status: "won", valueInCents: proposal.totalInCents, closedAt: now, updatedAt: now }).where(eq(crmOpportunities.id, proposal.opportunityId));
      await tx.insert(financialEntries).values({ organizationId: organization.id, type: "receivable", status: "pending", source: "proposal", description: proposal.title, amountInCents: proposal.totalInCents, dueDate: now.toISOString().slice(0, 10), clientId: proposal.clientId, crmProposalId: proposal.id, createdByUserId: session.user.id }).onConflictDoNothing();
    }
  });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: `crm.proposal.${status}`, entityType: "crm_proposal", entityId: proposalId });
  revalidatePath("/crm"); revalidatePath("/crm/propostas");
}

export async function addCrmTag(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "crm.manage");
  const leadId = text(formData, "leadId");
  const name = text(formData, "name");
  if (!name) throw new Error("Informe a etiqueta.");
  const [lead] = await db.select({ id: crmLeads.id }).from(crmLeads).where(and(eq(crmLeads.id, leadId), eq(crmLeads.organizationId, organization.id))).limit(1);
  if (!lead) throw new Error("Lead não encontrado.");
  await db.transaction(async (tx) => {
    await tx.insert(crmTags).values({ organizationId: organization.id, name, color: text(formData, "color") || "#37664f" }).onConflictDoNothing();
    const [tag] = await tx.select({ id: crmTags.id }).from(crmTags).where(and(eq(crmTags.organizationId, organization.id), eq(crmTags.name, name))).limit(1);
    if (tag) await tx.insert(crmLeadTags).values({ organizationId: organization.id, leadId, tagId: tag.id }).onConflictDoNothing();
  });
  revalidatePath(`/crm/leads/${leadId}`);
}

export async function createCrmCustomField(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "crm.manage");
  const name = text(formData, "name");
  const fieldType = text(formData, "fieldType");
  if (!name || !["text", "number", "date", "select"].includes(fieldType)) throw new Error("Defina nome e tipo válidos.");
  await db.insert(crmCustomFields).values({ organizationId: organization.id, name, fieldType, options: text(formData, "options").split(",").map((item) => item.trim()).filter(Boolean) }).onConflictDoNothing();
  revalidatePath("/crm/configuracoes");
}

export async function setCrmCustomFieldValue(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "crm.manage");
  const leadId = text(formData, "leadId"); const fieldId = text(formData, "fieldId");
  const [field] = await db.select({ id: crmCustomFields.id }).from(crmCustomFields).where(and(eq(crmCustomFields.id, fieldId), eq(crmCustomFields.organizationId, organization.id))).limit(1);
  if (!field) throw new Error("Campo personalizado inválido.");
  await db.insert(crmCustomFieldValues).values({ organizationId: organization.id, leadId, fieldId, value: optional(formData, "value") })
    .onConflictDoUpdate({ target: [crmCustomFieldValues.leadId, crmCustomFieldValues.fieldId], set: { value: optional(formData, "value"), updatedAt: new Date() } });
  revalidatePath(`/crm/leads/${leadId}`);
}

export async function generateCrmAiInsight(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "crm.manage");
  const leadId = text(formData, "leadId");
  const apiUrl = process.env.CRM_AI_API_URL; const apiKey = process.env.CRM_AI_API_KEY; const model = process.env.CRM_AI_MODEL;
  if (!apiUrl || !apiKey || !model) throw new Error("Configure CRM_AI_API_URL, CRM_AI_API_KEY e CRM_AI_MODEL para ativar a análise assistida.");
  const [lead] = await db.select().from(crmLeads).where(and(eq(crmLeads.id, leadId), eq(crmLeads.organizationId, organization.id))).limit(1);
  if (!lead) throw new Error("Lead não encontrado.");
  const [opportunity] = await db.select().from(crmOpportunities).where(and(eq(crmOpportunities.organizationId, organization.id), eq(crmOpportunities.leadId, leadId))).orderBy(desc(crmOpportunities.createdAt)).limit(1);
  const [conversation] = await db.select({ id: chatConversations.id }).from(chatConversations).where(and(eq(chatConversations.organizationId, organization.id), eq(chatConversations.leadId, leadId))).orderBy(desc(chatConversations.lastMessageAt)).limit(1);
  const messages = conversation ? await db.select({ direction: chatMessages.direction, body: chatMessages.body }).from(chatMessages).where(and(eq(chatMessages.organizationId, organization.id), eq(chatMessages.conversationId, conversation.id))).orderBy(desc(chatMessages.occurredAt)).limit(20) : [];
  const response = await fetch(apiUrl, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, response_format: { type: "json_object" }, messages: [
    { role: "system", content: "Você analisa uma oportunidade comercial. Não faça diagnóstico clínico. Responda somente JSON com summary, intent, urgency (1 a 5), suggestedAction e suggestedReply. A resposta é apenas sugestão e será revisada por uma pessoa." },
    { role: "user", content: JSON.stringify({ lead: { name: lead.name, source: lead.source, notes: lead.notes }, opportunity: opportunity ? { title: opportunity.title, valueInCents: opportunity.valueInCents, status: opportunity.status } : null, recentMessages: messages.reverse().map((item) => ({ direction: item.direction, body: item.body?.slice(0, 1000) })) }) }
  ] }) });
  if (!response.ok) throw new Error("O provedor de IA não conseguiu concluir a análise.");
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("O provedor de IA retornou uma resposta vazia.");
  let insight: { summary?: string; intent?: string; urgency?: number; suggestedAction?: string; suggestedReply?: string };
  try { insight = JSON.parse(content); } catch { throw new Error("A resposta da IA não veio no formato esperado."); }
  if (!insight.summary) throw new Error("A análise da IA não contém um resumo.");
  const [created] = await db.insert(crmAiInsights).values({ organizationId: organization.id, leadId, opportunityId: opportunity?.id, conversationId: conversation?.id, requestedByUserId: session.user.id, summary: insight.summary, intent: insight.intent, urgency: Math.min(5, Math.max(1, Number(insight.urgency) || 1)), suggestedAction: insight.suggestedAction, suggestedReply: insight.suggestedReply, model, inputTokens: payload.usage?.prompt_tokens, outputTokens: payload.usage?.completion_tokens }).returning({ id: crmAiInsights.id });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "crm.ai.generated", entityType: "crm_ai_insight", entityId: created.id, details: { model } });
  revalidatePath(`/crm/leads/${leadId}`);
}

export async function reviewCrmAiInsight(formData: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "crm.manage");
  const id = text(formData, "insightId"); const status = text(formData, "status");
  if (status !== "approved" && status !== "dismissed") throw new Error("Revisão inválida.");
  await db.update(crmAiInsights).set({ status, reviewedByUserId: session.user.id, reviewedAt: new Date() }).where(and(eq(crmAiInsights.id, id), eq(crmAiInsights.organizationId, organization.id)));
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: `crm.ai.${status}`, entityType: "crm_ai_insight", entityId: id });
  revalidatePath("/crm");
}
