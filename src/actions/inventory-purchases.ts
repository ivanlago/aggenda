"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { inventoryMovements, inventoryProducts, inventoryPurchaseItems, inventoryPurchases, inventorySuppliers } from "@/db/schema";
import { lockLotProduct, receiveInventoryLot, stockMillis, validLotDate } from "@/lib/inventory-lots";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

const path = "/estoque/compras";
const maxInteger = 2_147_483_647;
const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function saveInventorySupplier(form: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "inventory.manage");
  const id = field(form, "id");
  const name = field(form, "name");
  const email = field(form, "email");
  const phone = field(form, "phone");
  const document = field(form, "document");
  if ((id && !z.uuid().safeParse(id).success) || name.length < 2 || name.length > 160 ||
      (email && !z.email().max(160).safeParse(email).success) || phone.length > 40 || document.length > 30) {
    return { error: "Revise o nome e os dados de contato do fornecedor." };
  }
  const values = { name, email: email || null, phone: phone || null, document: document || null, isActive: form.get("active") === "on" };
  if (id) {
    const [updated] = await db.update(inventorySuppliers).set(values).where(and(
      eq(inventorySuppliers.id, id), eq(inventorySuppliers.organizationId, organization.id),
    )).returning({ id: inventorySuppliers.id });
    if (!updated) return { error: "Fornecedor não encontrado." };
  } else {
    await db.insert(inventorySuppliers).values({ organizationId: organization.id, ...values });
  }
  revalidatePath(path);
}

const purchaseInput = z.object({
  id: z.uuid(), supplierId: z.uuid(), purchasedOn: z.string().refine(validLotDate), reference: z.string().max(120),
  items: z.array(z.object({
    productId: z.uuid(),
    pool: z.enum(["sale", "consumption"]),
    quantity: z.string(),
    unitCost: z.string().trim().regex(/^\d{1,7}(?:[.,]\d{1,2})?$/),
    code: z.string().trim().max(100),
    expiresOn: z.string().refine(value => !value || validLotDate(value)),
  })).min(1).max(30),
});

export async function registerInventoryPurchase(form: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "inventory.manage");
  const columns = ["productId", "pool", "quantity", "unitCost", "code", "expiresOn"] as const;
  const data = columns.map(column => form.getAll(column));
  if (!data.every(column => column.length === data[0].length) || data[0].length > 30) return { error: "Revise os itens da compra." };
  const parsed = purchaseInput.safeParse({
    id: field(form, "requestId"), supplierId: field(form, "supplierId"), purchasedOn: field(form, "purchasedOn"),
    reference: field(form, "reference"),
    items: data[0].map((_, index) => Object.fromEntries(columns.map((column, position) => [column, data[position][index]]))),
  });
  if (!parsed.success) return { error: "Revise fornecedor, data, itens, custos e validade." };
  const input = parsed.data;
  let items;
  try {
    items = input.items.map(item => {
      const quantityMillis = stockMillis(item.quantity);
      const unitCostInCents = Math.round(Number(item.unitCost.replace(",", ".")) * 100);
      const totalInCents = Number((BigInt(quantityMillis) * BigInt(unitCostInCents) + BigInt(500)) / BigInt(1000));
      return { ...item, quantityMillis, unitCostInCents, totalInCents };
    }).sort((a, b) => a.productId.localeCompare(b.productId));
  } catch {
    return { error: "Informe quantidades positivas, com até três casas decimais." };
  }
  const totalInCents = items.reduce((total, item) => total + item.totalInCents, 0);
  if (totalInCents > maxInteger) return { error: "O valor total ultrapassa o limite da compra." };

  try {
    await db.transaction(async tx => {
      const [previous] = await tx.select({ id: inventoryPurchases.id }).from(inventoryPurchases).where(and(
        eq(inventoryPurchases.id, input.id), eq(inventoryPurchases.organizationId, organization.id),
      ));
      if (previous) return;
      const [supplier] = await tx.select().from(inventorySuppliers).where(and(
        eq(inventorySuppliers.id, input.supplierId), eq(inventorySuppliers.organizationId, organization.id),
        eq(inventorySuppliers.isActive, true),
      )).for("share");
      if (!supplier) throw new Error("Selecione um fornecedor ativo da empresa.");
      const [purchase] = await tx.insert(inventoryPurchases).values({
        id: input.id, organizationId: organization.id, supplierId: supplier.id, supplierName: supplier.name,
        purchasedOn: input.purchasedOn, reference: input.reference || null, totalInCents, createdByUserId: session.user.id,
      }).onConflictDoNothing().returning({ id: inventoryPurchases.id });
      if (!purchase) {
        const [sameOrganization] = await tx.select({ id: inventoryPurchases.id }).from(inventoryPurchases).where(and(
          eq(inventoryPurchases.id, input.id), eq(inventoryPurchases.organizationId, organization.id),
        ));
        if (sameOrganization) return;
        throw new Error("Não foi possível identificar a compra.");
      }
      const notes = ["Compra " + purchase.id, supplier.name, input.reference].filter(Boolean).join(" · ");
      for (const item of items) {
        const product = await lockLotProduct(tx, organization.id, item.productId);
        if (!product.isActive) throw new Error("Produto inativo: " + product.name);
        const code = item.code.toLocaleUpperCase("pt-BR");
        if ((product.lotTracking || code || item.expiresOn) && (!code || !item.expiresOn || code.startsWith("SEM LOTE ("))) {
          throw new Error("Informe número e validade do lote para " + product.name + ".");
        }
        let lotId: string | null = null;
        if (code) {
          const lot = await receiveInventoryLot(tx, {
            organizationId: organization.id, userId: session.user.id, productId: product.id,
            code, informedCode: code, expiresOn: item.expiresOn, pool: item.pool, mode: "entry",
            amount: item.quantityMillis, supplier: supplier.name, notes,
          });
          lotId = lot.id;
        } else {
          const aggregate = item.pool === "sale" ? "currentQuantityMillis" : "consumptionQuantityMillis";
          const balance = product[aggregate] + item.quantityMillis;
          if (balance > maxInteger) throw new Error("Saldo acima do limite para " + product.name + ".");
          await tx.update(inventoryProducts).set({ [aggregate]: balance, updatedAt: new Date() }).where(eq(inventoryProducts.id, product.id));
          await tx.insert(inventoryMovements).values({
            organizationId: organization.id, productId: product.id, type: "entry", quantityMillis: item.quantityMillis,
            balanceAfterMillis: balance, notes: notes + " · " + (item.pool === "sale" ? "venda" : "consumo"),
            createdByUserId: session.user.id,
          });
        }
        await tx.insert(inventoryPurchaseItems).values({
          purchaseId: purchase.id, productId: product.id, productName: product.name, lotId, pool: item.pool,
          quantityMillis: item.quantityMillis, unitCostInCents: item.unitCostInCents, totalInCents: item.totalInCents,
        });
      }
    });
  } catch (error) {
    if (error instanceof Error && !error.cause) return { error: error.message };
    throw error;
  }
  revalidatePath(path);
  revalidatePath("/estoque");
  revalidatePath("/estoque/lotes", "layout");
  revalidatePath("/vendas");
  revalidatePath("/atendimento", "layout");
}
