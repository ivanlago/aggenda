"use server";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { inventoryLots, inventoryProducts } from "@/db/schema";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";
import { moveInventory } from "./inventory";
import { moveInventoryLot, registerInventoryLot } from "./inventory-lots";

export async function getInventoryMovementContext(productId: string) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "inventory.manage");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId)) throw new Error("Selecione um produto válido.");
  const [product] = await db.select({ id: inventoryProducts.id, name: inventoryProducts.name, unit: inventoryProducts.unit, tracked: inventoryProducts.lotTracking, sale: inventoryProducts.currentQuantityMillis, consumption: inventoryProducts.consumptionQuantityMillis }).from(inventoryProducts).where(and(eq(inventoryProducts.id, productId), eq(inventoryProducts.organizationId, organization.id)));
  if (!product) throw new Error("Produto não encontrado nesta clínica.");
  const lots = await db.select({ id: inventoryLots.id, code: inventoryLots.code, expiresOn: inventoryLots.expiresOn, status: inventoryLots.status, sale: inventoryLots.saleQuantityMillis, consumption: inventoryLots.consumptionQuantityMillis }).from(inventoryLots).where(and(eq(inventoryLots.productId, productId), eq(inventoryLots.organizationId, organization.id))).orderBy(asc(inventoryLots.expiresOn), asc(inventoryLots.code)).limit(1001);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: organization.timezone }).format(new Date());
  return { product, lots: lots.slice(0, 1000), truncated: lots.length > 1000, today };
}

/** The server determines whether a lot is mandatory, regardless of client fields. */
export async function saveInventoryMovement(form: FormData) {
  const productId = String(form.get("productId") ?? "");
  const context = await getInventoryMovementContext(productId);
  const type = String(form.get("type") ?? "");
  if (!["entry", "exit", "consumption", "usage"].includes(type)) throw new Error("Selecione uma operação válida.");
  const usesLots = context.product.tracked || context.lots.length > 0 || form.get("useLots") === "on";
  const notes = String(form.get("notes") ?? "").trim();
  if ((usesLots || type === "entry" || type === "exit") && (notes.length < 3 || notes.length > 1000)) throw new Error("Informe o motivo da movimentação, com 3 a 1.000 caracteres.");
  if (!usesLots) return moveInventory(form);
  const mapped = new FormData();
  for (const [key, value] of form.entries()) mapped.set(key, value);
  const lotId = String(form.get("lotId") ?? "");
  if (lotId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lotId)) throw new Error("Selecione um lote válido.");
    const { organization } = await requireOrganization();
    const [lot] = await db.select().from(inventoryLots).where(and(eq(inventoryLots.id, lotId), eq(inventoryLots.productId, productId), eq(inventoryLots.organizationId, organization.id)));
    if (!lot) throw new Error("O lote selecionado não pertence a este produto e clínica.");
    mapped.set("code", lot.code); mapped.set("expiresOn", lot.expiresOn ?? "");
  }
  if (type === "entry") {
    mapped.set("mode", form.get("mode") === "existing" ? "existing" : "entry");
    return registerInventoryLot(mapped);
  }
  if (!context.product.tracked) throw new Error("Conclua a distribuição e ative o controle na aba Lotes e recolhimentos antes de registrar saídas.");
  if (!lotId) throw new Error("Selecione o lote da movimentação.");
  mapped.set("type", type === "exit" ? "discard" : type === "consumption" ? "transfer" : "usage");
  mapped.set("pool", type === "usage" ? "consumption" : type === "consumption" ? "sale" : String(form.get("pool") ?? ""));
  mapped.set("reason", String(form.get("notes") ?? ""));
  return moveInventoryLot(mapped);
}
