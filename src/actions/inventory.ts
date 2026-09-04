"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { inventoryCategories, inventoryMovements, inventoryProducts, inventorySubcategories, retailProductVariants, serviceInventoryItems, services } from "@/db/schema";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";
const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const quantity = (data: FormData, key: string) => { const parsed = Number(text(data, key).replace(",", ".")); if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Informe uma quantidade válida."); return Math.round(parsed * 1000); };
export async function moveInventory(data: FormData) { const { session, organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "inventory.manage"); const productId = text(data, "productId"); const type = text(data, "type"); const entered = quantity(data, "quantity"); if (!entered || !["entry", "adjustment_remove", "consumption"].includes(type)) throw new Error("Informe tipo e quantidade."); await db.transaction(async (tx) => { await tx.execute(sql`select id from inventory_products where id = ${productId} for update`); const [product] = await tx.select().from(inventoryProducts).where(and(eq(inventoryProducts.id, productId), eq(inventoryProducts.organizationId, organization.id))).limit(1); if (!product) throw new Error("Produto não encontrado."); const delta = type === "entry" ? entered : -entered; const balance = product.currentQuantityMillis + delta; if (balance < 0) throw new Error("A movimentação deixaria o estoque negativo."); await tx.update(inventoryProducts).set({ currentQuantityMillis: balance, updatedAt: new Date() }).where(eq(inventoryProducts.id, productId)); await tx.insert(inventoryMovements).values({ organizationId: organization.id, productId, type, quantityMillis: delta, balanceAfterMillis: balance, notes: text(data, "notes") || null, createdByUserId: session.user.id }); }); revalidatePath("/estoque"); }

export async function createInventoryCategory(data: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "inventory.manage");
  const name = text(data, "name");
  if (name.length < 2) throw new Error("Informe o nome da categoria.");
  await db.insert(inventoryCategories).values({ organizationId: organization.id, name });
  revalidatePath("/estoque");
}

export async function createInventorySubcategory(data: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "inventory.manage");
  const categoryId = text(data, "categoryId");
  const name = text(data, "name");
  const [category] = await db.select({ id: inventoryCategories.id }).from(inventoryCategories).where(and(eq(inventoryCategories.id, categoryId), eq(inventoryCategories.organizationId, organization.id))).limit(1);
  if (!category || name.length < 2) throw new Error("Informe uma categoria e o nome da subcategoria.");
  await db.insert(inventorySubcategories).values({ organizationId: organization.id, categoryId, name });
  revalidatePath("/estoque");
}
export async function setServiceInventoryItem(data: FormData) { const { organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "inventory.manage"); const serviceId = text(data, "serviceId"); const productId = text(data, "productId"); const amount = quantity(data, "quantity"); const [service, product] = await Promise.all([db.select({ id: services.id }).from(services).where(and(eq(services.id, serviceId), eq(services.organizationId, organization.id))).limit(1), db.select({ id: inventoryProducts.id }).from(inventoryProducts).innerJoin(retailProductVariants, eq(retailProductVariants.inventoryProductId, inventoryProducts.id)).where(and(eq(inventoryProducts.id, productId), eq(inventoryProducts.organizationId, organization.id), eq(retailProductVariants.isForProcedures, true), eq(retailProductVariants.isActive, true))).limit(1)]); if (!service.length || !product.length || !amount) throw new Error("Serviço, produto ou quantidade inválida."); await db.insert(serviceInventoryItems).values({ organizationId: organization.id, serviceId, productId, quantityMillis: amount }).onConflictDoUpdate({ target: [serviceInventoryItems.serviceId, serviceInventoryItems.productId], set: { quantityMillis: amount } }); revalidatePath("/estoque"); }
export async function removeServiceInventoryItem(data: FormData) { const { organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "inventory.manage"); await db.delete(serviceInventoryItems).where(and(eq(serviceInventoryItems.organizationId, organization.id), eq(serviceInventoryItems.serviceId, text(data, "serviceId")), eq(serviceInventoryItems.productId, text(data, "productId")))); revalidatePath("/estoque"); }
