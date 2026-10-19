"use server";

import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { clinicalConsultationRecords, inventoryLots, inventoryLotAllocations, inventoryLotRecalls, inventoryRecallFollowUps, inventoryMovements, inventoryProducts } from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { requireClinicalClient } from "@/lib/clinical-access";
import { assertOrganizationPermission } from "@/lib/permissions";
import { allocateLots, lockLotProduct, lotAudit, stockMillis, validLotDate } from "@/lib/inventory-lots";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
function refresh() { revalidatePath("/estoque"); revalidatePath("/estoque/lotes"); revalidatePath("/atendimento", "layout"); revalidatePath("/vendas"); }

export async function registerInventoryLot(form: FormData) {
  const { organization, session } = await requireOrganization();
  assertOrganizationPermission(organization.role, "inventory.manage");
  const productId = text(form, "productId"), code = text(form, "code").toLocaleUpperCase("pt-BR"), expiresOn = text(form, "expiresOn");
  const pool = text(form, "pool"), mode = text(form, "mode"), amount = stockMillis(text(form, "quantity"));
  if (!code || code.length > 100 || !validLotDate(expiresOn) || !["sale", "consumption"].includes(pool) || !["existing", "entry"].includes(mode)) throw new Error("Revise produto, lote, validade, destino e origem do saldo.");
  await db.transaction(async tx => {
    const product = await lockLotProduct(tx, organization.id, productId);
    const lots = await tx.select().from(inventoryLots).where(and(eq(inventoryLots.organizationId, organization.id), eq(inventoryLots.productId, productId))).for("update");
    const existing = lots.find(lot => lot.code === code);
    if (existing && (existing.expiresOn !== expiresOn || existing.status !== "active")) throw new Error("Este lote está bloqueado ou já possui outra validade. Não é permitido trocar sua identificação.");
    const field = pool === "sale" ? "saleQuantityMillis" : "consumptionQuantityMillis";
    const total = pool === "sale" ? product.currentQuantityMillis : product.consumptionQuantityMillis;
    if (mode === "existing" && (product.lotTracking || lots.reduce((n, lot) => n + lot[field], 0) + amount > total)) throw new Error("A quantidade excede o saldo ainda sem lote ou o controle já está ativo.");
    const [lot] = existing ? await tx.update(inventoryLots).set({ [field]: existing[field] + amount, updatedAt: new Date() }).where(eq(inventoryLots.id, existing.id)).returning() : await tx.insert(inventoryLots).values({ organizationId: organization.id, productId, code, expiresOn, [field]: amount, supplier: text(form, "supplier").slice(0, 200) || null }).returning();
    if (mode === "entry") {
      const aggregate = pool === "sale" ? "currentQuantityMillis" : "consumptionQuantityMillis";
      await tx.update(inventoryProducts).set({ [aggregate]: total + amount, updatedAt: new Date() }).where(eq(inventoryProducts.id, productId));
      await tx.insert(inventoryMovements).values({ organizationId: organization.id, productId, type: "entry", quantityMillis: amount, balanceAfterMillis: total + amount, notes: [`Lote ${code} · ${pool === "sale" ? "venda" : "consumo"}`, text(form, "notes").slice(0, 1000)].filter(Boolean).join(" · "), createdByUserId: session.user.id });
    }
    await lotAudit(tx, organization.id, session.user.id, `inventory.lot.${mode}`, lot.id, { amount, pool, notes: text(form, "notes").slice(0, 1000) || null });
  }); refresh();
}

export async function activateInventoryLots(form: FormData) {
  const { organization, session } = await requireOrganization();
  assertOrganizationPermission(organization.role, "inventory.manage");
  await db.transaction(async tx => {
    const product = await lockLotProduct(tx, organization.id, text(form, "productId"));
    const lots = await tx.select().from(inventoryLots).where(and(eq(inventoryLots.organizationId, organization.id), eq(inventoryLots.productId, product.id)));
    if (lots.reduce((n, lot) => n + lot.saleQuantityMillis, 0) !== product.currentQuantityMillis || lots.reduce((n, lot) => n + lot.consumptionQuantityMillis, 0) !== product.consumptionQuantityMillis) throw new Error("Distribua todo o saldo de venda e consumo entre os lotes antes de ativar.");
    await tx.update(inventoryProducts).set({ lotTracking: true, updatedAt: new Date() }).where(eq(inventoryProducts.id, product.id));
    await lotAudit(tx, organization.id, session.user.id, "inventory.lot.activate", product.id);
  }); refresh();
}

export async function moveInventoryLot(form: FormData) {
  const { organization, session } = await requireOrganization();
  assertOrganizationPermission(organization.role, "inventory.manage");
  const type = text(form, "type"), pool = text(form, "pool"), lotId = text(form, "lotId"), reason = text(form, "reason");
  if (!["transfer", "usage", "discard"].includes(type) || !["sale", "consumption"].includes(pool) || reason.length < 3 || reason.length > 1000) throw new Error("Informe operação, destino e motivo da entrada/saída.");
  const amount = stockMillis(text(form, "quantity"));
  await db.transaction(async tx => {
    const [lot] = await tx.select().from(inventoryLots).where(and(eq(inventoryLots.id, lotId), eq(inventoryLots.organizationId, organization.id)));
    if (!lot) throw new Error("Lote não encontrado.");
    const product = await lockLotProduct(tx, organization.id, lot.productId);
    const sourcePool = type === "transfer" ? "sale" : pool as "sale" | "consumption";
    await allocateLots(tx, { organizationId: organization.id, productId: product.id, referenceType: "manual", referenceId: randomUUID(), userId: session.user.id, lotId, quantityMillis: amount, pool: sourcePool, allowBlocked: type === "discard" });
    if (!product.lotTracking) throw new Error("Ative o controle por lote antes de movimentar.");
    if (type === "transfer") await tx.update(inventoryLots).set({ consumptionQuantityMillis: sql`${inventoryLots.consumptionQuantityMillis} + ${amount}`, updatedAt: new Date() }).where(eq(inventoryLots.id, lotId));
    const sale = product.currentQuantityMillis - (sourcePool === "sale" ? amount : 0);
    const consumption = product.consumptionQuantityMillis - (sourcePool === "consumption" ? amount : 0) + (type === "transfer" ? amount : 0);
    await tx.update(inventoryProducts).set({ currentQuantityMillis: sale, consumptionQuantityMillis: consumption, updatedAt: new Date() }).where(eq(inventoryProducts.id, product.id));
    await tx.insert(inventoryMovements).values({ organizationId: organization.id, productId: product.id, type: type === "transfer" ? "consumption" : type === "usage" ? "usage" : "exit", quantityMillis: -amount, balanceAfterMillis: sourcePool === "sale" ? sale : consumption, notes: `Lote ${lot.code}: ${reason}`, createdByUserId: session.user.id });
    await lotAudit(tx, organization.id, session.user.id, `inventory.lot.${type}`, lotId, { quantityMillis: amount, pool: sourcePool, reason });
  }); refresh();
}

export async function quarantineInventoryLot(form: FormData) {
  const { organization, session } = await requireOrganization();
  assertOrganizationPermission(organization.role, "inventory.manage");
  const status = text(form, "status"), reason = text(form, "reason");
  if (!["active", "quarantine"].includes(status) || reason.length < 3 || reason.length > 1000) throw new Error("Informe situação e justificativa.");
  await db.transaction(async tx => {
    const [found] = await tx.select().from(inventoryLots).where(and(eq(inventoryLots.id, text(form, "lotId")), eq(inventoryLots.organizationId, organization.id)));
    if (!found) throw new Error("Lote não encontrado.");
    await lockLotProduct(tx, organization.id, found.productId);
    const [lot] = await tx.select().from(inventoryLots).where(eq(inventoryLots.id, found.id)).for("update");
    if (lot.status === "recalled" || (status === "active" && !lot.expiresOn)) throw new Error("Lotes recolhidos ou sem rastreabilidade não podem ser liberados.");
    await tx.update(inventoryLots).set({ status, updatedAt: new Date() }).where(eq(inventoryLots.id, lot.id));
    await lotAudit(tx, organization.id, session.user.id, `inventory.lot.${status}`, lot.id, { reason });
  }); refresh();
}

export async function recallInventoryLot(form: FormData) {
  const { organization, session } = await requireOrganization();
  assertOrganizationPermission(organization.role, "inventory.manage");
  if (form.get("confirmRecall") !== "on") throw new Error("Confirme o bloqueio do lote para iniciar o recolhimento.");
  const reason = text(form, "reason");
  if (reason.length < 3 || reason.length > 1000) throw new Error("Descreva o motivo do recolhimento.");
  await db.transaction(async tx => {
    const [found] = await tx.select().from(inventoryLots).where(and(eq(inventoryLots.id, text(form, "lotId")), eq(inventoryLots.organizationId, organization.id)));
    if (!found) throw new Error("Lote não encontrado.");
    const product = await lockLotProduct(tx, organization.id, found.productId);
    const [recall] = await tx.insert(inventoryLotRecalls).values({ organizationId: organization.id, lotId: found.id, reason, createdByUserId: session.user.id }).onConflictDoNothing({ target: inventoryLotRecalls.lotId }).returning();
    if (!recall) return;
    await tx.update(inventoryLots).set({ status: "recalled", updatedAt: new Date() }).where(eq(inventoryLots.id, found.id));
    const uses = await tx.select().from(inventoryLotAllocations).where(and(eq(inventoryLotAllocations.organizationId, organization.id), eq(inventoryLotAllocations.lotId, found.id)));
    for (const use of uses.filter(use => use.referenceType !== "manual")) await tx.insert(inventoryRecallFollowUps).values({ organizationId: organization.id, recallId: recall.id, sourceKey: `${use.referenceType}:${use.referenceId}`, clientId: use.clientId, appointmentId: use.appointmentId, saleId: use.referenceType === "sale" ? use.referenceId : null }).onConflictDoNothing();
    // Legacy records are immutable: recover exact lot/name matches without rewriting their content.
    const records = await tx.select({ id: clinicalConsultationRecords.id, clientId: clinicalConsultationRecords.clientId, appointmentId: clinicalConsultationRecords.appointmentId, data: clinicalConsultationRecords.data }).from(clinicalConsultationRecords).where(and(eq(clinicalConsultationRecords.organizationId, organization.id), eq(clinicalConsultationRecords.kind, "evolution"), sql`exists (select 1 from jsonb_array_elements(coalesce(${clinicalConsultationRecords.data}->'applications','[]'::jsonb)) a where upper(trim(a->>'lot')) = ${found.code} and (a->>'lotId' = ${found.id} or lower(trim(a->>'product')) = ${product.name.toLocaleLowerCase("pt-BR")}))`));
    for (const record of records) await tx.insert(inventoryRecallFollowUps).values({ organizationId: organization.id, recallId: recall.id, sourceKey: `clinical:${record.id}`, clientId: record.clientId, appointmentId: record.appointmentId }).onConflictDoNothing();
    await lotAudit(tx, organization.id, session.user.id, "inventory.lot.recall", found.id, { recallId: recall.id, reason });
  }); refresh();
}

export async function updateRecallFollowUp(form: FormData) {
  const { organization, session } = await requireOrganization();
  assertOrganizationPermission(organization.role, "clinical.manage");
  const status = text(form, "status"), notes = text(form, "notes");
  if (!["pending", "contacted", "resolved"].includes(status) || notes.length < 3 || notes.length > 2000) throw new Error("Informe situação e anotação do acompanhamento.");
  const [follow] = await db.select().from(inventoryRecallFollowUps).where(and(eq(inventoryRecallFollowUps.organizationId, organization.id), eq(inventoryRecallFollowUps.id, text(form, "followUpId"))));
  if (!follow) throw new Error("Acompanhamento não encontrado.");
  if (follow.clientId) await requireClinicalClient(follow.clientId, true);
  else if (organization.role === "professional") throw new Error("Sem vínculo com paciente para este acompanhamento.");
  await db.transaction(async tx => {
    const [recall] = await tx.select().from(inventoryLotRecalls).where(and(eq(inventoryLotRecalls.id, follow.recallId), eq(inventoryLotRecalls.organizationId, organization.id))).for("update");
    if (recall?.status !== "open") throw new Error("Recolhimento já encerrado.");
    await tx.update(inventoryRecallFollowUps).set({ status, notes, updatedByUserId: session.user.id, updatedAt: new Date() }).where(eq(inventoryRecallFollowUps.id, follow.id));
    await lotAudit(tx, organization.id, session.user.id, "inventory.recall.follow_up", follow.id, { status, notes });
  }); refresh();
}

export async function closeInventoryRecall(form: FormData) {
  const { organization, session } = await requireOrganization();
  assertOrganizationPermission(organization.role, "inventory.manage");
  await db.transaction(async tx => {
    const [recall] = await tx.select().from(inventoryLotRecalls).where(and(eq(inventoryLotRecalls.organizationId, organization.id), eq(inventoryLotRecalls.id, text(form, "recallId")))).for("update");
    if (!recall) throw new Error("Recolhimento não encontrado.");
    const follow = await tx.select({ status: inventoryRecallFollowUps.status }).from(inventoryRecallFollowUps).where(eq(inventoryRecallFollowUps.recallId, recall.id));
    if (follow.some(item => item.status !== "resolved")) throw new Error("Conclua o acompanhamento de todos os registros antes de encerrar.");
    const [lot] = await tx.select().from(inventoryLots).where(eq(inventoryLots.id, recall.lotId));
    if (lot.saleQuantityMillis + lot.consumptionQuantityMillis > 0) throw new Error("Registre o descarte ou devolução do saldo recolhido antes de encerrar.");
    await tx.update(inventoryLotRecalls).set({ status: "closed", closedAt: new Date() }).where(eq(inventoryLotRecalls.id, recall.id));
    await lotAudit(tx, organization.id, session.user.id, "inventory.recall.close", recall.lotId);
  }); refresh();
}
