import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { db } from "../db";
import { auditLogs, inventoryLots, inventoryLotAllocations, inventoryLotRecalls, inventoryProducts, organizations } from "../db/schema";

export type LotTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type LotReference = { organizationId: string; productId: string; referenceType: "sale" | "appointment" | "clinical" | "manual"; referenceId: string; userId: string; clientId?: string | null; appointmentId?: string | null };
export function stockMillis(value: unknown) {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,3})?$/.test(raw)) throw new Error("Informe uma quantidade positiva com até três casas decimais.");
  const amount = Math.round(Number(raw) * 1000);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2_147_483_647) throw new Error("Quantidade fora do limite.");
  return amount;
}
export function validLotDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export async function lotToday(tx: LotTransaction, organizationId: string) {
  const [org] = await tx.select({ timezone: organizations.timezone }).from(organizations).where(eq(organizations.id, organizationId));
  if (!org) throw new Error("Clínica não encontrada.");
  return new Intl.DateTimeFormat("sv-SE", { timeZone: org.timezone }).format(new Date());
}
export async function lockLotProduct(tx: LotTransaction, organizationId: string, productId: string) {
  const [product] = await tx.select().from(inventoryProducts).where(and(eq(inventoryProducts.id, productId), eq(inventoryProducts.organizationId, organizationId))).for("update");
  if (!product) throw new Error("Produto não encontrado nesta clínica.");
  return product;
}

/** Caller owns the transaction and updates the aggregate stock in that same transaction. */
export async function allocateLots(tx: LotTransaction, input: LotReference & { quantityMillis: number; pool: "sale" | "consumption" | "procedure"; lotId?: string; allowBlocked?: boolean }) {
  const product = await lockLotProduct(tx, input.organizationId, input.productId);
  if (!product.isActive && !input.allowBlocked) throw new Error("Produto inativo: não é permitido utilizar ou vender seu estoque.");
  const lots = await tx.select().from(inventoryLots).where(and(eq(inventoryLots.organizationId, input.organizationId), eq(inventoryLots.productId, input.productId))).orderBy(asc(inventoryLots.expiresOn), asc(inventoryLots.id)).for("update");
  if (!Number.isSafeInteger(input.quantityMillis) || input.quantityMillis <= 0) throw new Error("Quantidade inválida.");
  const assignedSale = lots.reduce((n, lot) => n + lot.saleQuantityMillis, 0);
  const assignedConsumption = lots.reduce((n, lot) => n + lot.consumptionQuantityMillis, 0);
  if (assignedSale > product.currentQuantityMillis || assignedConsumption > product.consumptionQuantityMillis || (product.lotTracking && (assignedSale !== product.currentQuantityMillis || assignedConsumption !== product.consumptionQuantityMillis))) throw new Error(`Saldos por lote de ${product.name} divergentes. Solicite conferência do estoque.`);
  const today = await lotToday(tx, input.organizationId);
  const eligible = lots.filter(lot => (!input.lotId || lot.id === input.lotId) && (input.allowBlocked || (lot.status === "active" && lot.expiresOn && lot.expiresOn >= today)));
  const pools = input.pool === "procedure" ? ["consumption", "sale"] as const : [input.pool];
  let remaining = input.quantityMillis;
  const portions: Array<{ lotId: string | null; pool: "sale" | "consumption"; quantityMillis: number }> = [];
  // FEFO: earlier expiry first, using procedure stock before sale stock within the lot.
  for (const lot of eligible) for (const pool of pools) {
    const quantityMillis = Math.min(remaining, pool === "sale" ? lot.saleQuantityMillis : lot.consumptionQuantityMillis);
    if (!quantityMillis) continue;
    portions.push({ lotId: lot.id, pool, quantityMillis }); remaining -= quantityMillis;
  }
  // Mixed stock: eligible lots first, then unassigned stock. Procedure fallback uses sale stock.
  if (remaining && !product.lotTracking && !input.lotId) {
    const pool = input.pool === "consumption" ? "consumption" : "sale";
    const available = pool === "sale" ? product.currentQuantityMillis - assignedSale : product.consumptionQuantityMillis - assignedConsumption;
    const quantityMillis = Math.min(remaining, available);
    if (quantityMillis) { portions.push({ lotId: null, pool, quantityMillis }); remaining -= quantityMillis; }
  }
  if (remaining) throw new Error(`Lote indisponível ou saldo válido insuficiente de ${product.name}. Lotes vencidos, sem validade ou bloqueados não podem ser utilizados.`);
  for (const portion of portions) {
    if (!portion.lotId) continue;
    const field = portion.pool === "sale" ? inventoryLots.saleQuantityMillis : inventoryLots.consumptionQuantityMillis;
    await tx.update(inventoryLots).set({ [portion.pool === "sale" ? "saleQuantityMillis" : "consumptionQuantityMillis"]: sql`${field} - ${portion.quantityMillis}`, updatedAt: new Date() }).where(eq(inventoryLots.id, portion.lotId));
    await tx.insert(inventoryLotAllocations).values({ ...input, ...portion, lotId: portion.lotId });
  }
  return portions;
}

/** Returns the original pools. Legacy returns without a known lot stay quarantined. */
export async function restoreLots(tx: LotTransaction, input: LotReference & { legacyQuantityMillis: number }) {
  const product = await lockLotProduct(tx, input.organizationId, input.productId);
  const allocations = await tx.select().from(inventoryLotAllocations).where(and(eq(inventoryLotAllocations.organizationId, input.organizationId), eq(inventoryLotAllocations.productId, input.productId), eq(inventoryLotAllocations.referenceType, input.referenceType), eq(inventoryLotAllocations.referenceId, input.referenceId), isNull(inventoryLotAllocations.reversedAt))).for("update");
  const totals = { sale: 0, consumption: 0 };
  for (const allocation of allocations) {
    const pool = allocation.pool as "sale" | "consumption";
    const field = pool === "sale" ? inventoryLots.saleQuantityMillis : inventoryLots.consumptionQuantityMillis;
    await tx.update(inventoryLots).set({ [pool === "sale" ? "saleQuantityMillis" : "consumptionQuantityMillis"]: sql`${field} + ${allocation.quantityMillis}`, updatedAt: new Date() }).where(and(eq(inventoryLots.id, allocation.lotId), eq(inventoryLots.organizationId, input.organizationId)));
    await tx.update(inventoryLotRecalls).set({ status: "open", closedAt: null }).where(and(eq(inventoryLotRecalls.organizationId, input.organizationId), eq(inventoryLotRecalls.lotId, allocation.lotId), eq(inventoryLotRecalls.status, "closed")));
    totals[pool] += allocation.quantityMillis;
    await tx.update(inventoryLotAllocations).set({ reversedAt: new Date() }).where(eq(inventoryLotAllocations.id, allocation.id));
  }
  const unassignedReturn = Math.max(0, input.legacyQuantityMillis - totals.sale - totals.consumption);
  totals.sale += unassignedReturn;
  if (unassignedReturn && product.lotTracking) await tx.insert(inventoryLots).values({ organizationId: input.organizationId, productId: product.id, code: `DEVOLUCAO-${input.referenceType}-${input.referenceId}`, status: "quarantine", saleQuantityMillis: unassignedReturn, notes: "Devolução sem lote conhecido. Não liberada para uso ou venda." });
  return totals;
}

export async function lotAudit(tx: LotTransaction, organizationId: string, userId: string, action: string, entityId: string, details?: Record<string, unknown>) {
  await tx.insert(auditLogs).values({ organizationId, userId, action, entityType: "inventory_lot", entityId, details });
}
