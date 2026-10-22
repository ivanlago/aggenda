import { and, eq } from "drizzle-orm";
import { inventoryLots, inventoryMovements, inventoryProducts } from "../db/schema";
import type { ClinicalConsultationData } from "./clinical-record";
import { allocateLots, lockLotProduct, type LotTransaction } from "./inventory-lots";

export async function consumeClinicalLots(tx: LotTransaction, input: { organizationId: string; clientId: string; appointmentId: string; recordId: string; userId: string; appointmentStatus: string; data: ClinicalConsultationData }) {
  const applications = input.data.applications;
  if (!applications.length) return;
  if (input.appointmentStatus === "completed") throw new Error("Para vincular produtos ao estoque, finalize o registro clínico antes de concluir o atendimento. Reabra o atendimento para conferir o consumo existente.");
  const selected = [];
  for (const application of applications) {
    if (!application.lotId) throw new Error("Selecione um lote cadastrado para cada produto aplicado. Cadastre produtos externos como entrada no estoque de consumo.");
    const [lot] = await tx.select().from(inventoryLots).where(and(eq(inventoryLots.id, application.lotId), eq(inventoryLots.organizationId, input.organizationId)));
    if (!lot) throw new Error("Lote da aplicação não encontrado nesta clínica.");
    selected.push({ application, lot });
  }
  for (const { application, lot } of selected.sort((a, b) => a.lot.productId.localeCompare(b.lot.productId))) {
    const product = await lockLotProduct(tx, input.organizationId, lot.productId);
    const unit = ["unit", "un", "unidade"].includes(product.unit.toLowerCase()) ? "unidade" : product.unit.toLowerCase();
    if (unit !== application.unit.toLowerCase() || product.name !== application.product || lot.code !== application.lot || lot.expiresOn !== application.expiresOn) throw new Error("Produto, unidade, lote ou validade divergentes do cadastro. Selecione novamente o lote; não há conversão automática de unidades.");
    const amount = Math.round(Number(application.quantity) * 1000);
    if (Math.abs(Number(application.quantity) * 1000 - amount) > 0.00001) throw new Error("Use até três casas decimais na quantidade aplicada.");
    const portions = await allocateLots(tx, { organizationId: input.organizationId, productId: product.id, referenceType: "clinical", referenceId: input.recordId, clientId: input.clientId, appointmentId: input.appointmentId, userId: input.userId, quantityMillis: amount, pool: "procedure", lotId: lot.id });
    const sale = product.currentQuantityMillis - portions.filter(part => part.pool === "sale").reduce((sum, part) => sum + part.quantityMillis, 0);
    const consumption = product.consumptionQuantityMillis - portions.filter(part => part.pool === "consumption").reduce((sum, part) => sum + part.quantityMillis, 0);
    await tx.update(inventoryProducts).set({ currentQuantityMillis: sale, consumptionQuantityMillis: consumption, updatedAt: new Date() }).where(eq(inventoryProducts.id, product.id));
    await tx.insert(inventoryMovements).values({ organizationId: input.organizationId, productId: product.id, appointmentId: input.appointmentId, type: "clinical_application", quantityMillis: -amount, balanceAfterMillis: sale + consumption, notes: `Aplicação clínica · lote ${lot.code}`, createdByUserId: input.userId });
  }
}
