import { and, asc, desc, eq } from "drizzle-orm";
import { BadgeDollarSign, PackageCheck, ShoppingBag } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { RetailSaleForm } from "@/components/retail-sale-form";
import { db } from "@/db";
import { clients, inventoryProducts, retailProductVariants, retailProducts, retailSaleItems, retailSales } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

const currency = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const paymentLabels: Record<string, string> = { pix: "PIX", card: "Cartões", cash: "Espécie", credit_card: "Crédito", debit_card: "Débito" };
export const metadata = { title: "Vendas" };

export default async function SalesPage() {
  const { organization } = await requireOrganization();
  const canSell = hasOrganizationPermission(organization.role, "inventory.manage");
  const [variantRows, clientRows, sales, items] = await Promise.all([
    db.select({ id: retailProductVariants.id, productName: retailProducts.name, variantName: retailProductVariants.name, barcode: retailProductVariants.barcode, priceInCents: retailProductVariants.salePriceInCents, stockMillis: inventoryProducts.currentQuantityMillis })
      .from(retailProductVariants).innerJoin(retailProducts, eq(retailProducts.id, retailProductVariants.productId)).innerJoin(inventoryProducts, eq(inventoryProducts.id, retailProductVariants.inventoryProductId))
      .where(and(eq(retailProductVariants.organizationId, organization.id), eq(retailProductVariants.isForSale, true), eq(retailProductVariants.isActive, true), eq(retailProducts.isActive, true), eq(inventoryProducts.isActive, true))).orderBy(asc(retailProducts.name), asc(retailProductVariants.name)),
    db.select({ id: clients.id, name: clients.name, email: clients.email, phone: clients.phone }).from(clients).where(eq(clients.organizationId, organization.id)).orderBy(asc(clients.name)),
    db.select({ id: retailSales.id, clientName: clients.name, paymentMethod: retailSales.paymentMethod, subtotal: retailSales.subtotalInCents, discount: retailSales.discountInCents, total: retailSales.totalInCents, soldAt: retailSales.soldAt })
      .from(retailSales).leftJoin(clients, eq(clients.id, retailSales.clientId)).where(eq(retailSales.organizationId, organization.id)).orderBy(desc(retailSales.soldAt)).limit(30),
    db.select({ saleId: retailSaleItems.saleId, productName: retailSaleItems.productName, variantName: retailSaleItems.variantName, quantity: retailSaleItems.quantity, total: retailSaleItems.totalInCents })
      .from(retailSaleItems).where(eq(retailSaleItems.organizationId, organization.id)),
  ]);
  const variants = variantRows.map((item) => ({ id: item.id, label: `${item.productName} · ${item.variantName}`, barcode: item.barcode, priceInCents: item.priceInCents, stock: Math.floor(item.stockMillis / 1000) })).filter((item) => item.stock > 0);
  const totalSold = sales.reduce((sum, sale) => sum + sale.total, 0);
  const visibleSaleIds = new Set(sales.map((sale) => sale.id));
  const itemsBySale = new Map<string, typeof items>();
  let unitsSold = 0;
  for (const item of items) {
    if (!visibleSaleIds.has(item.saleId)) continue;
    unitsSold += item.quantity;
    itemsBySale.set(item.saleId, [...(itemsBySale.get(item.saleId) ?? []), item]);
  }

  return <div className="page-wrap">
    <PageHeader eyebrow="Varejo" title="Venda" description="Registre vendas, gere a receita financeira e baixe automaticamente o estoque dos produtos." />
    <section className="grid gap-4 sm:grid-cols-3">
      <article className="panel"><ShoppingBag className="size-5 text-brand" /><p className="mt-4 text-3xl font-extrabold">{sales.length}</p><p className="text-sm text-muted">vendas recentes</p></article>
      <article className="panel"><PackageCheck className="size-5 text-brand" /><p className="mt-4 text-3xl font-extrabold">{unitsSold}</p><p className="text-sm text-muted">unidades vendidas</p></article>
      <article className="panel"><BadgeDollarSign className="size-5 text-brand" /><p className="mt-4 text-2xl font-extrabold">{currency(totalSold)}</p><p className="text-sm text-muted">nas vendas exibidas</p></article>
    </section>
    {canSell && <section className="mt-5"><RetailSaleForm variants={variants} clients={clientRows} /></section>}
    <section className="panel mt-5"><h2 className="text-lg font-extrabold">Histórico de vendas</h2><div className="mt-4 divide-y">
      {sales.length === 0 && <p className="py-6 text-center text-sm text-muted">Nenhuma venda registrada.</p>}
      {sales.map((sale) => <article className="grid gap-3 py-4 lg:grid-cols-[1fr_auto]" key={sale.id}>
        <div><p className="font-extrabold">Venda #{sale.id.slice(0, 8)}</p><p className="text-xs text-muted">{sale.clientName || "Cliente não identificado"} · {sale.soldAt.toLocaleString("pt-BR")} · {paymentLabels[sale.paymentMethod ?? ""] ?? "Não informado"}</p><p className="mt-2 text-sm">{(itemsBySale.get(sale.id) ?? []).map((item) => `${item.quantity}× ${item.productName} · ${item.variantName}`).join("; ")}</p></div>
        <div className="lg:text-right"><p className="text-xl font-extrabold text-brand">{currency(sale.total)}</p>{sale.discount > 0 && <p className="text-xs text-muted">subtotal {currency(sale.subtotal)} · desconto {currency(sale.discount)}</p>}</div>
      </article>)}
    </div></section>
  </div>;
}
