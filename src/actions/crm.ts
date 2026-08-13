"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  clients,
  crmLeads,
  crmOpportunities,
  crmPipelines,
  crmStages,
  crmTasks,
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
