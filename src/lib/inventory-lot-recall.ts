import { and, eq, sql } from "drizzle-orm";
import { clinicalConsultationRecords, inventoryLots, inventoryLotAllocations, inventoryLotRecalls, inventoryRecallFollowUps } from "../db/schema";
import { lockLotProduct, lotAudit, type LotTransaction } from "./inventory-lots";

export async function startLotRecall(tx: LotTransaction, input: { organizationId: string; userId: string; lotId: string; reason: string }) {
    const [found] = await tx.select().from(inventoryLots).where(and(eq(inventoryLots.id, input.lotId), eq(inventoryLots.organizationId, input.organizationId)));
    if (!found) throw new Error("Lote não encontrado.");
    const product = await lockLotProduct(tx, input.organizationId, found.productId);
    const [recall] = await tx.insert(inventoryLotRecalls).values({ organizationId: input.organizationId, lotId: found.id, reason: input.reason, createdByUserId: input.userId }).onConflictDoNothing({ target: inventoryLotRecalls.lotId }).returning();
    if (!recall) return;
    await tx.update(inventoryLots).set({ status: "recalled", updatedAt: new Date() }).where(eq(inventoryLots.id, found.id));
    const uses = await tx.select().from(inventoryLotAllocations).where(and(eq(inventoryLotAllocations.organizationId, input.organizationId), eq(inventoryLotAllocations.lotId, found.id)));
    for (const use of uses.filter(use => use.referenceType !== "manual")) await tx.insert(inventoryRecallFollowUps).values({ organizationId: input.organizationId, recallId: recall.id, sourceKey: `${use.referenceType}:${use.referenceId}`, clientId: use.clientId, appointmentId: use.appointmentId, saleId: use.referenceType === "sale" ? use.referenceId : null }).onConflictDoNothing();
    // Legacy records are immutable: recover exact lot/name matches without rewriting their content.
    const records = await tx.select({ id: clinicalConsultationRecords.id, clientId: clinicalConsultationRecords.clientId, appointmentId: clinicalConsultationRecords.appointmentId, data: clinicalConsultationRecords.data }).from(clinicalConsultationRecords).where(and(eq(clinicalConsultationRecords.organizationId, input.organizationId), eq(clinicalConsultationRecords.kind, "evolution"), sql`exists (select 1 from jsonb_array_elements(coalesce(${clinicalConsultationRecords.data}->'applications','[]'::jsonb)) a where upper(trim(a->>'lot')) = ${found.code} and (a->>'lotId' = ${found.id} or lower(trim(a->>'product')) = ${product.name.toLocaleLowerCase("pt-BR")}))`));
    for (const record of records) await tx.insert(inventoryRecallFollowUps).values({ organizationId: input.organizationId, recallId: recall.id, sourceKey: `clinical:${record.id}`, clientId: record.clientId, appointmentId: record.appointmentId }).onConflictDoNothing();
    await lotAudit(tx, input.organizationId, input.userId, "inventory.lot.recall", found.id, { recallId: recall.id, reason: input.reason });
}
