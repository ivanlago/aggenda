import { and, asc, desc, eq } from "drizzle-orm";
import { Boxes, CircleDollarSign, WalletCards } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { inventoryCategories, inventoryMovements, inventoryProducts, inventorySubcategories, retailProductVariants, retailProducts } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

import { StockMovementForm } from "./stock-movement-form";
import { StockProductForm } from "./stock-product-form";
import { InventoryTabs } from "./inventory-tabs";
import type { StockMovementRow } from "./stock-movement-list";
import type { StockProductRow } from "./stock-product-list";

const currency = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const quantity = (millis: number) => (millis / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export const metadata = { title: "Estoque" };

export default async function InventoryPage() {
  const { organization } = await requireOrganization();
  const canManage = hasOrganizationPermission(organization.role, "inventory.manage");
  const [items, categories, subcategories, movements] = await Promise.all([
    db.select({
      id: inventoryProducts.id, variantId: retailProductVariants.id, name: retailProducts.name, presentation: retailProductVariants.name,
      brand: retailProducts.brand, description: retailProducts.description, barcode: retailProductVariants.barcode,
      sku: inventoryProducts.sku, unit: inventoryProducts.unit,
      quantity: inventoryProducts.currentQuantityMillis, consumptionQuantity: inventoryProducts.consumptionQuantityMillis,
      minimum: inventoryProducts.minimumQuantityMillis,
      cost: inventoryProducts.costInCents, salePrice: retailProductVariants.salePriceInCents,
      categoryId: retailProducts.categoryId, category: inventoryCategories.name,
      subcategoryId: retailProducts.subcategoryId, subcategory: inventorySubcategories.name,
    }).from(retailProductVariants)
      .innerJoin(retailProducts, eq(retailProducts.id, retailProductVariants.productId))
      .innerJoin(inventoryProducts, eq(inventoryProducts.id, retailProductVariants.inventoryProductId))
      .leftJoin(inventoryCategories, eq(inventoryCategories.id, retailProducts.categoryId))
      .leftJoin(inventorySubcategories, eq(inventorySubcategories.id, retailProducts.subcategoryId))
      .where(and(eq(retailProductVariants.organizationId, organization.id), eq(retailProductVariants.isActive, true)))
      .orderBy(asc(retailProducts.name), asc(retailProductVariants.name)),
    db.select({ id: inventoryCategories.id, name: inventoryCategories.name }).from(inventoryCategories).where(eq(inventoryCategories.organizationId, organization.id)).orderBy(inventoryCategories.name),
    db.select({ id: inventorySubcategories.id, categoryId: inventorySubcategories.categoryId, name: inventorySubcategories.name }).from(inventorySubcategories).where(eq(inventorySubcategories.organizationId, organization.id)).orderBy(inventorySubcategories.name),
    db.select({
      id: inventoryMovements.id, type: inventoryMovements.type, quantity: inventoryMovements.quantityMillis,
      balance: inventoryMovements.balanceAfterMillis, notes: inventoryMovements.notes, createdAt: inventoryMovements.createdAt,
      productName: retailProducts.name, presentation: retailProductVariants.name,
    }).from(inventoryMovements)
      .innerJoin(inventoryProducts, eq(inventoryProducts.id, inventoryMovements.productId))
      .innerJoin(retailProductVariants, eq(retailProductVariants.inventoryProductId, inventoryProducts.id))
      .innerJoin(retailProducts, eq(retailProducts.id, retailProductVariants.productId))
      .where(eq(inventoryMovements.organizationId, organization.id))
      .orderBy(desc(inventoryMovements.createdAt)),
  ]);
  const costValue = items.reduce((sum, item) => sum + (item.cost ?? 0) * item.quantity / 1000, 0);
  const saleValue = items.reduce((sum, item) => sum + item.salePrice * item.quantity / 1000, 0);
  const rows: StockProductRow[] = items.map((item) => ({
    id: item.id, variantId: item.variantId, name: item.name,
    presentation: item.presentation === "Padrão" ? "—" : item.presentation, rawPresentation: item.presentation === "Padrão" ? "" : item.presentation,
    brand: item.brand || "—", rawBrand: item.brand ?? "", sku: item.sku ?? "", barcode: item.barcode ?? "",
    unit: item.unit, description: item.description ?? "", quantity: item.quantity,
    consumptionQuantity: item.consumptionQuantity, consumptionQuantityLabel: quantity(item.consumptionQuantity), minimum: item.minimum,
    costValue: ((item.cost ?? 0) / 100).toFixed(2).replace(".", ","), saleValue: (item.salePrice / 100).toFixed(2).replace(".", ","),
    minimumValue: quantity(item.minimum),
    quantityLabel: quantity(item.quantity),
    costUnit: currency(item.cost ?? 0), costTotal: currency((item.cost ?? 0) * item.quantity / 1000),
    saleUnit: currency(item.salePrice), saleTotal: currency(item.salePrice * item.quantity / 1000),
    consumptionCostTotal: currency((item.cost ?? 0) * item.consumptionQuantity / 1000),
    consumptionSaleTotal: currency(item.salePrice * item.consumptionQuantity / 1000),
    categoryId: item.categoryId, category: item.category ?? "", subcategoryId: item.subcategoryId,
    subcategory: item.subcategory ?? "", hasConsumption: item.consumptionQuantity > 0,
  }));
  const movementLabels: Record<string, string> = {
    entry: "Entrada", initial: "Estoque inicial", exit: "Saída / ajuste", consumption: "Retirada para consumo",
    sale: "Venda", sale_cancellation: "Cancelamento de venda", sale_refund: "Estorno de venda",
  };
  const movementRows: StockMovementRow[] = movements.map((item) => ({
    id: item.id, productName: item.productName,
    presentation: item.presentation === "Padrão" ? "—" : item.presentation,
    type: item.type, typeLabel: movementLabels[item.type] ?? item.type,
    direction: item.quantity >= 0 ? "entry" : "exit",
    quantity: quantity(Math.abs(item.quantity)), balance: quantity(item.balance), notes: item.notes ?? "",
    occurredAt: item.createdAt.toISOString(),
    occurredOn: new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bahia", year: "numeric", month: "2-digit", day: "2-digit" }).format(item.createdAt),
    occurredAtLabel: item.createdAt.toLocaleString("pt-BR", { timeZone: "America/Bahia", dateStyle: "short", timeStyle: "short" }),
  }));

  return <div className="page-wrap">
    <PageHeader eyebrow="Operação" title="Estoque" description="Cadastre produtos, registre entradas e saídas e acompanhe os valores do estoque." />
    <section className="grid gap-4 sm:grid-cols-3">
      <article className="panel"><Boxes className="size-5 text-brand" /><p className="mt-4 text-3xl font-extrabold">{items.length}</p><p className="text-sm text-muted">produtos cadastrados</p></article>
      <article className="panel"><WalletCards className="size-5 text-brand" /><p className="mt-4 text-2xl font-extrabold">{currency(costValue)}</p><p className="text-sm text-muted">valor de custo</p></article>
      <article className="panel"><CircleDollarSign className="size-5 text-brand" /><p className="mt-4 text-2xl font-extrabold">{currency(saleValue)}</p><p className="text-sm text-muted">valor de venda</p></article>
    </section>
    {canManage && <div className="mt-5 flex flex-wrap gap-2"><StockProductForm categories={categories} subcategories={subcategories} /><StockMovementForm products={rows.map((item) => ({ id: item.id, name: `${item.name} ${item.presentation === "—" ? "" : item.presentation}`.trim(), balance: item.quantityLabel }))} /></div>}
    <InventoryTabs products={rows} movements={movementRows} categories={categories} subcategories={subcategories} canManage={canManage} />
  </div>;
}
