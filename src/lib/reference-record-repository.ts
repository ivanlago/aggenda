import { and, eq } from "drizzle-orm";
import type { db } from "@/db";
import { financialAccounts, financialCategories, financialCostCenters, financialEntries, inventoryCategories, inventorySubcategories, retailProducts, serviceCategories, services } from "@/db/schema";
import type { ReferenceKind } from "./reference-records";

export type ReferenceInput = { kind: ReferenceKind; id?: string; name: string; categoryId?: string; type?: "payable" | "receivable"; accountType?: "bank" | "cash" | "digital_wallet"; openingBalanceInCents?: number };
const tables = { product_category: inventoryCategories, product_subcategory: inventorySubcategories, service_category: serviceCategories, financial_account: financialAccounts, financial_category: financialCategories, cost_center: financialCostCenters };

export async function saveReferenceRecord(database: typeof db, organizationId: string, input: ReferenceInput) {
  const table = tables[input.kind];
  return database.transaction(async (tx) => {
    if (input.id) {
      const [current] = await tx.select().from(table).where(and(eq(table.organizationId, organizationId), eq(table.id, input.id))).for("update");
      if (!current) throw new Error("Cadastro não encontrado.");
      // Financial type, opening balance and parent links are immutable here.
      const [record] = await tx.update(table).set({ name: input.name }).where(and(eq(table.organizationId, organizationId), eq(table.id, input.id))).returning();
      if (input.kind === "financial_category") await tx.update(financialEntries).set({ category: input.name }).where(and(eq(financialEntries.organizationId, organizationId), eq(financialEntries.categoryId, input.id)));
      return record;
    }
    const common = { organizationId, name: input.name };
    switch (input.kind) {
      case "product_category": return (await tx.insert(inventoryCategories).values(common).returning())[0];
      case "service_category": return (await tx.insert(serviceCategories).values(common).returning())[0];
      case "cost_center": return (await tx.insert(financialCostCenters).values(common).returning())[0];
      case "financial_category": {
        if (!input.type) throw new Error("Escolha receita ou despesa.");
        return (await tx.insert(financialCategories).values({ ...common, type: input.type }).returning())[0];
      }
      case "financial_account": return (await tx.insert(financialAccounts).values({ ...common, accountType: input.accountType ?? "bank", openingBalanceInCents: input.openingBalanceInCents ?? 0 }).returning())[0];
      case "product_subcategory": {
        const [category] = await tx.select({ id: inventoryCategories.id }).from(inventoryCategories).where(and(eq(inventoryCategories.organizationId, organizationId), eq(inventoryCategories.id, input.categoryId!))).for("update");
        if (!category) throw new Error("Escolha uma categoria válida.");
        return (await tx.insert(inventorySubcategories).values({ ...common, categoryId: category.id }).returning())[0];
      }
    }
  });
}

export async function changeReferenceRecord(database: typeof db, organizationId: string, kind: ReferenceKind, id: string, operation: "delete" | "activate" | "deactivate") {
  const table = tables[kind];
  await database.transaction(async (tx) => {
    const [current] = await tx.select().from(table).where(and(eq(table.organizationId, organizationId), eq(table.id, id))).for("update");
    if (!current) throw new Error("Cadastro não encontrado.");
    if (kind === "financial_account" || kind === "financial_category" || kind === "cost_center") {
      if (operation === "delete") throw new Error("Desative o cadastro financeiro para preservar o histórico.");
      const financialTable = kind === "financial_account" ? financialAccounts : kind === "financial_category" ? financialCategories : financialCostCenters;
      await tx.update(financialTable).set({ isActive: operation === "activate" }).where(and(eq(financialTable.organizationId, organizationId), eq(financialTable.id, id)));
      return;
    }
    if (operation !== "delete") throw new Error("Operação inválida para este cadastro.");
    if (kind === "product_category") {
      const [child] = await tx.select({ id: inventorySubcategories.id }).from(inventorySubcategories).where(and(eq(inventorySubcategories.organizationId, organizationId), eq(inventorySubcategories.categoryId, id))).limit(1);
      const [product] = await tx.select({ id: retailProducts.id }).from(retailProducts).where(and(eq(retailProducts.organizationId, organizationId), eq(retailProducts.categoryId, id))).limit(1);
      if (child || product) throw new Error("Reclassifique os produtos e remova as subcategorias antes de excluir esta categoria.");
    }
    if (kind === "product_subcategory") {
      const [product] = await tx.select({ id: retailProducts.id }).from(retailProducts).where(and(eq(retailProducts.organizationId, organizationId), eq(retailProducts.subcategoryId, id))).limit(1);
      if (product) throw new Error("Reclassifique os produtos antes de excluir esta subcategoria.");
    }
    if (kind === "service_category") await tx.update(services).set({ categoryId: null, updatedAt: new Date() }).where(and(eq(services.organizationId, organizationId), eq(services.categoryId, id)));
    await tx.delete(table).where(and(eq(table.organizationId, organizationId), eq(table.id, id)));
  });
}
