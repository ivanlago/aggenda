"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, financialEntries, professionalFiscalAllocations, professionalFiscalOutflows, professionalFiscalPartnerships, professionalFiscalShares, services } from "@/db/schema";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";
import { partnershipPending, readPartnershipContract } from "@/lib/partnership-compliance";
import { calculateFiscalShare, parseHundredths } from "@/lib/professional-fiscal-share";

const field = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const uuid = (form: FormData, key: string) => z.uuid().parse(field(form, key));

export async function recordPartnershipAllocation(form: FormData) {
  const { organization, session } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.manage");
  const professionalId = uuid(form, "professionalId"), financialEntryId = uuid(form, "financialEntryId"), serviceId = uuid(form, "serviceId");
  const grossInCents = parseHundredths(field(form, "gross"));
  const withheldInCents = parseHundredths(field(form, "withheld") || "0");
  const withholdingDescription = field(form, "withholdingDescription");
  if (!grossInCents || grossInCents > 2_147_483_647 || withheldInCents === null) return { error: "Informe os valores válidos da apuração." };
  if (withholdingDescription.length > 2000 || withheldInCents > 0 && !withholdingDescription) return { error: "Descreva os tributos e retenções informados pelo contador." };
  if (form.get("confirmed") !== "on") return { error: "Confirme o serviço e o valor recebido atribuídos a esta parceria." };
  await db.transaction(async tx => {
    // All allocations of a receipt serialize here, including different partners.
    const [receipt] = await tx.select().from(financialEntries).where(and(eq(financialEntries.organizationId, organization.id), eq(financialEntries.id, financialEntryId))).for("update");
    if (!receipt || receipt.type !== "receivable" || receipt.status !== "received" || !receipt.realizedDate) throw new Error("Selecione um recebimento confirmado e com data de recebimento.");
    const [partner] = await tx.select().from(professionalFiscalPartnerships).where(and(eq(professionalFiscalPartnerships.organizationId, organization.id), eq(professionalFiscalPartnerships.professionalId, professionalId))).for("update");
    if (!partner?.isActive) throw new Error("A parceria não está ativa nesta empresa.");
    const contract = readPartnershipContract(partner.contract);
    const pending = partnershipPending(contract, receipt.realizedDate);
    if (pending.length) throw new Error(`Complete o cadastro da parceria: ${pending.join("; ")}.`);
    const [service] = await tx.select({ name: services.name }).from(services).where(and(eq(services.organizationId, organization.id), eq(services.id, serviceId)));
    const [rate] = await tx.select().from(professionalFiscalShares).where(and(eq(professionalFiscalShares.professionalId, professionalId), eq(professionalFiscalShares.serviceId, serviceId)));
    if (!service || !rate) throw new Error("Cadastre a cota-parte contratual deste serviço antes de apurar.");
    const allocations = await tx.select({ gross: professionalFiscalAllocations.grossInCents, professionalId: professionalFiscalAllocations.professionalId, serviceId: professionalFiscalAllocations.serviceId }).from(professionalFiscalAllocations).where(and(eq(professionalFiscalAllocations.financialEntryId, financialEntryId), eq(professionalFiscalAllocations.organizationId, organization.id), isNull(professionalFiscalAllocations.voidedAt)));
    if (allocations.some(row => row.professionalId === professionalId && row.serviceId === serviceId)) throw new Error("Este serviço já foi apurado para o parceiro neste recebimento.");
    if (allocations.reduce((sum, row) => sum + row.gross, grossInCents) > receipt.amountInCents) throw new Error("As cotas atribuídas ultrapassam o valor recebido. Confira as apurações dos demais parceiros.");
    const split = calculateFiscalShare(grossInCents, rate.percentageBasisPoints);
    if (!split || withheldInCents > split.professional) throw new Error("As retenções não podem ultrapassar a cota-parte do parceiro.");
    const [created] = await tx.insert(professionalFiscalAllocations).values({ organizationId: organization.id, professionalId, financialEntryId, serviceId, receivedOn: receipt.realizedDate, grossInCents, percentageBasisPoints: rate.percentageBasisPoints, partnerInCents: split.professional, salonInCents: split.salon, withheldInCents, withholdingDescription, snapshot: { cnpj: partner.cnpj, contract, serviceName: service.name }, createdByUserId: session.user.id }).returning({ id: professionalFiscalAllocations.id });
    await tx.insert(auditLogs).values({ organizationId: organization.id, userId: session.user.id, action: "record", entityType: "fiscal_allocation", entityId: created.id, details: { financialEntryId, professionalId, grossInCents, ...split, withheldInCents } });
  });
  revalidatePath("/equipe/parceria-fiscal");
  revalidatePath("/financeiro/relatorios");
}

export async function updatePartnershipDocuments(form: FormData) {
  const { organization, session } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.manage");
  const id = uuid(form, "id");
  const consumerInvoice = field(form, "consumerInvoice"), partnerInvoice = field(form, "partnerInvoice");
  if (consumerInvoice.length > 240 || partnerInvoice.length > 240) return { error: "Use no máximo 240 caracteres para identificar cada documento." };
  await db.transaction(async tx => {
    const [before] = await tx.select().from(professionalFiscalAllocations).where(and(eq(professionalFiscalAllocations.organizationId, organization.id), eq(professionalFiscalAllocations.id, id))).for("update");
    if (!before || before.voidedAt) throw new Error("Apuração não encontrada ou já estornada.");
    await tx.update(professionalFiscalAllocations).set({ consumerInvoice, partnerInvoice }).where(eq(professionalFiscalAllocations.id, id));
    await tx.insert(auditLogs).values({ organizationId: organization.id, userId: session.user.id, action: "documents", entityType: "fiscal_allocation", entityId: id, details: { before: { consumerInvoice: before.consumerInvoice, partnerInvoice: before.partnerInvoice }, after: { consumerInvoice, partnerInvoice } } });
  });
  revalidatePath("/equipe/parceria-fiscal");
  revalidatePath("/financeiro/relatorios");
}

export async function voidPartnershipAllocation(form: FormData) {
  const { organization, session } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.manage");
  const id = uuid(form, "id"), reason = field(form, "reason");
  if (reason.length < 5 || reason.length > 500) return { error: "Informe o motivo do estorno (5 a 500 caracteres)." };
  await db.transaction(async tx => {
    // Use the receipt as the same lock as recordPartnershipAllocation.
    const [source] = await tx.select({ entryId: professionalFiscalAllocations.financialEntryId }).from(professionalFiscalAllocations).where(and(eq(professionalFiscalAllocations.organizationId, organization.id), eq(professionalFiscalAllocations.id, id)));
    if (!source) throw new Error("Apuração não encontrada nesta empresa.");
    await tx.execute(sql`SELECT id FROM financial_entries WHERE id=${source.entryId} AND organization_id=${organization.id} FOR UPDATE`);
    await tx.select({ id: professionalFiscalAllocations.id }).from(professionalFiscalAllocations).where(and(eq(professionalFiscalAllocations.id,id),eq(professionalFiscalAllocations.organizationId,organization.id))).for("update");
    const linked = await tx.select({ id: professionalFiscalOutflows.id }).from(professionalFiscalOutflows).where(and(eq(professionalFiscalOutflows.organizationId, organization.id), eq(professionalFiscalOutflows.allocationId, id))).limit(1);
    if (linked.length) throw new Error("Desvincule os repasses e recolhimentos antes de estornar esta apuração.");
    const [updated] = await tx.update(professionalFiscalAllocations).set({ voidedAt: new Date(), voidReason: reason }).where(and(eq(professionalFiscalAllocations.organizationId, organization.id), eq(professionalFiscalAllocations.id, id), isNull(professionalFiscalAllocations.voidedAt))).returning({ id: professionalFiscalAllocations.id });
    if (updated) await tx.insert(auditLogs).values({ organizationId: organization.id, userId: session.user.id, action: "void", entityType: "fiscal_allocation", entityId: id, details: { reason } });
  });
  revalidatePath("/equipe/parceria-fiscal");
  revalidatePath("/financeiro/relatorios");
}

export async function linkPartnershipOutflow(form: FormData) {
  const { organization, session } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.manage");
  const allocationId = uuid(form, "allocationId"), financialEntryId = uuid(form, "financialEntryId");
  const kind = z.enum(["net_transfer", "tax_remittance"]).parse(field(form, "kind"));
  await db.transaction(async tx => {
    const [allocation] = await tx.select().from(professionalFiscalAllocations).where(and(eq(professionalFiscalAllocations.organizationId, organization.id), eq(professionalFiscalAllocations.id, allocationId))).for("update");
    if (!allocation || allocation.voidedAt) throw new Error("Apuração não encontrada ou estornada.");
    const [entry] = await tx.select().from(financialEntries).where(and(eq(financialEntries.organizationId, organization.id), eq(financialEntries.id, financialEntryId))).for("update");
    const expected = kind === "net_transfer" ? allocation.partnerInCents - allocation.withheldInCents : allocation.withheldInCents;
    if (!entry || entry.type !== "payable" || entry.status !== "paid" || !entry.realizedDate || !expected || entry.amountInCents !== expected || entry.source !== "manual") throw new Error("Selecione um pagamento manual já realizado, de valor exatamente igual ao repasse líquido ou ao tributo desta apuração.");
    const duplicate = await tx.select({ id: professionalFiscalOutflows.id }).from(professionalFiscalOutflows).where(and(eq(professionalFiscalOutflows.organizationId, organization.id), sql`(${professionalFiscalOutflows.financialEntryId}=${financialEntryId} OR (${professionalFiscalOutflows.allocationId}=${allocationId} AND ${professionalFiscalOutflows.kind}=${kind}))`)).limit(1);
    if (duplicate.length) throw new Error("O pagamento ou esse tipo de repasse já está vinculado.");
    const [created] = await tx.insert(professionalFiscalOutflows).values({ organizationId: organization.id, allocationId, financialEntryId, kind, amountInCents: expected, createdByUserId: session.user.id }).returning({ id: professionalFiscalOutflows.id });
    await tx.insert(auditLogs).values({ organizationId: organization.id, userId: session.user.id, action: "link_outflow", entityType: "fiscal_allocation", entityId: allocationId, details: { outflowId: created.id, financialEntryId, kind, amountInCents: expected } });
  });
  revalidatePath("/equipe/parceria-fiscal");
  revalidatePath("/financeiro/relatorios");
}

export async function unlinkPartnershipOutflow(form: FormData) {
  const { organization, session } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.manage");
  const id = uuid(form, "id");
  const reason = z.string().min(5).max(500).parse(field(form, "reason"));
  await db.transaction(async tx => {
    const [before] = await tx.delete(professionalFiscalOutflows).where(and(eq(professionalFiscalOutflows.organizationId, organization.id), eq(professionalFiscalOutflows.id, id))).returning();
    if (!before) throw new Error("Vínculo não encontrado nesta empresa.");
    await tx.insert(auditLogs).values({ organizationId: organization.id, userId: session.user.id, action: "unlink_outflow", entityType: "fiscal_allocation", entityId: before.allocationId, details: { before, reason } });
  });
  revalidatePath("/equipe/parceria-fiscal");
  revalidatePath("/financeiro/relatorios");
}
