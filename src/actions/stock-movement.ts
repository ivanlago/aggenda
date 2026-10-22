"use server";

import { and, asc, eq, gt, ilike, lt, or } from "drizzle-orm";
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
  if (!["entry", "exit", "consumption", "usage", "expired", "recall"].includes(type)) throw new Error("Selecione uma operação válida.");
  const entryIdentification = type === "entry" && Boolean(String(form.get("code") ?? "").trim() || String(form.get("expiresOn") ?? "").trim());
  const usesLots = context.product.tracked || Boolean(form.get("lotId")) || entryIdentification || (type === "entry" && form.get("useLots") === "on") || form.get("mode") === "existing";
  const notes = String(form.get("notes") ?? "").trim();
  if ((usesLots || ["entry", "exit", "expired", "recall"].includes(type)) && (notes.length < 3 || notes.length > 1000)) throw new Error("Informe o motivo da entrada/saída, com 3 a 1.000 caracteres.");
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
  if (!lotId) throw new Error("Selecione o lote da entrada/saída.");
  mapped.set("type", ["expired", "recall"].includes(type) ? type : type === "exit" ? "discard" : type === "consumption" ? "transfer" : "usage");
  mapped.set("pool", type === "usage" ? "consumption" : type === "consumption" ? "sale" : String(form.get("pool") ?? ""));
  mapped.set("reason", String(form.get("notes") ?? ""));
  return moveInventoryLot(mapped);
}

/** Read-only, organization-scoped stock lookup; zero balances never appear. */
export async function searchInventoryLots(input: { kind: "expired" | "code"; query?: string; page?: number }) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "inventory.manage");
  if (input.kind !== "expired" && input.kind !== "code") throw new Error("Consulta inválida.");
  const query = String(input.query ?? "").trim().slice(0, 100);
  const page = Number.isSafeInteger(input.page) ? Math.max(1, Math.min(10000, input.page!)) : 1;
  if (input.kind === "code" && !query) throw new Error("Informe o número do lote.");
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: organization.timezone }).format(new Date());
  const pattern = `%${query.replace(/[\\%_]/g, char => `\\${char}`)}%`;
  const rows = await db.select({ id: inventoryLots.id, productId: inventoryLots.productId, name: inventoryProducts.name, unit: inventoryProducts.unit, code: inventoryLots.code, expiresOn: inventoryLots.expiresOn, status: inventoryLots.status, sale: inventoryLots.saleQuantityMillis, consumption: inventoryLots.consumptionQuantityMillis, createdAt: inventoryLots.createdAt })
    .from(inventoryLots).innerJoin(inventoryProducts, and(eq(inventoryProducts.id, inventoryLots.productId), eq(inventoryProducts.organizationId, organization.id)))
    .where(and(eq(inventoryLots.organizationId, organization.id), or(gt(inventoryLots.saleQuantityMillis, 0), gt(inventoryLots.consumptionQuantityMillis, 0)), input.kind === "expired" ? lt(inventoryLots.expiresOn, today) : ilike(inventoryLots.code, pattern), input.kind === "expired" && query ? ilike(inventoryProducts.name, pattern) : undefined))
    .orderBy(asc(inventoryLots.expiresOn), asc(inventoryLots.id)).limit(21).offset((page - 1) * 20);
  return { rows: rows.slice(0, 20).map(row => ({ ...row, enteredOn: new Intl.DateTimeFormat("pt-BR", { timeZone: organization.timezone }).format(row.createdAt), createdAt: undefined })), hasMore: rows.length > 20, page };
}
