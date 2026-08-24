import { and, asc, desc, eq } from "drizzle-orm";
import { BadgeDollarSign, PackageCheck, ShoppingBag } from "lucide-react";
import Link from "next/link";

import { reverseRetailSale } from "@/actions/retail";
import { ActionForm } from "@/components/action-form";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { PageHeader } from "@/components/page-header";
import { RetailSaleForm } from "@/components/retail-sale-form";
import { db } from "@/db";
import { clients, inventoryProducts, retailProductVariants, retailProducts, retailSaleItems, retailSalePayments, retailSales, users } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

const currency = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const paymentLabels: Record<string, string> = { pix: "PIX", card: "Cartões", cash: "Espécie", credit_card: "Crédito", debit_card: "Débito" };
export const metadata = { title: "Vendas" };

export default async function SalesPage() {
  const { organization } = await requireOrganization();
  const canSell = hasOrganizationPermission(organization.role, "sales.sell") || hasOrganizationPermission(organization.role, "inventory.manage");
  const canDiscount = hasOrganizationPermission(organization.role, "sales.discount");
  const canCancel = hasOrganizationPermission(organization.role, "sales.cancel");
  const [variantRows, clientRows, sales, items, payments] = await Promise.all([
    db.select({ id: retailProductVariants.id, productName: retailProducts.name, variantName: retailProductVariants.name, barcode: retailProductVariants.barcode, priceInCents: retailProductVariants.salePriceInCents, stockMillis: inventoryProducts.currentQuantityMillis })
      .from(retailProductVariants).innerJoin(retailProducts, eq(retailProducts.id, retailProductVariants.productId)).innerJoin(inventoryProducts, eq(inventoryProducts.id, retailProductVariants.inventoryProductId))
      .where(and(eq(retailProductVariants.organizationId, organization.id), eq(retailProductVariants.isForSale, true), eq(retailProductVariants.isActive, true), eq(retailProducts.isActive, true), eq(inventoryProducts.isActive, true))).orderBy(asc(retailProducts.name), asc(retailProductVariants.name)),
    db.select({ id: clients.id, name: clients.name, email: clients.email, phone: clients.phone }).from(clients).where(eq(clients.organizationId, organization.id)).orderBy(asc(clients.name)),
    db.select({ id: retailSales.id, clientName: clients.name, operatorName: users.name, paymentMethod: retailSales.paymentMethod, receiptToken: retailSales.receiptToken, status: retailSales.status, subtotal: retailSales.subtotalInCents, discount: retailSales.discountInCents, total: retailSales.totalInCents, soldAt: retailSales.soldAt, cancellationReason: retailSales.cancellationReason })
      .from(retailSales).leftJoin(clients, eq(clients.id, retailSales.clientId)).leftJoin(users, eq(users.id, retailSales.createdByUserId)).where(eq(retailSales.organizationId, organization.id)).orderBy(desc(retailSales.soldAt)).limit(30),
    db.select({ saleId: retailSaleItems.saleId, productName: retailSaleItems.productName, variantName: retailSaleItems.variantName, quantity: retailSaleItems.quantity, total: retailSaleItems.totalInCents })
      .from(retailSaleItems).where(eq(retailSaleItems.organizationId, organization.id)),
    db.select({ saleId: retailSalePayments.saleId, method: retailSalePayments.method, amount: retailSalePayments.amountInCents }).from(retailSalePayments).where(eq(retailSalePayments.organizationId, organization.id)),
  ]);
  const variants = variantRows.map((item) => ({ id: item.id, label: `${item.productName} · ${item.variantName}`, barcode: item.barcode, priceInCents: item.priceInCents, stock: Math.floor(item.stockMillis / 1000) })).filter((item) => item.stock > 0);
  const totalSold = sales.reduce((sum, sale) => sum + (sale.status === "completed" ? sale.total : 0), 0);
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
    <nav className="mb-5 flex flex-wrap gap-2"><Link className="secondary-button" href="/vendas/historico">Histórico completo</Link><Link className="secondary-button" href="/vendas/relatorios">Relatórios do PDV</Link></nav>
    <section className="grid gap-4 sm:grid-cols-3">
      <article className="panel"><ShoppingBag className="size-5 text-brand" /><p className="mt-4 text-3xl font-extrabold">{sales.length}</p><p className="text-sm text-muted">vendas recentes</p></article>
      <article className="panel"><PackageCheck className="size-5 text-brand" /><p className="mt-4 text-3xl font-extrabold">{unitsSold}</p><p className="text-sm text-muted">unidades vendidas</p></article>
      <article className="panel"><BadgeDollarSign className="size-5 text-brand" /><p className="mt-4 text-2xl font-extrabold">{currency(totalSold)}</p><p className="text-sm text-muted">nas vendas exibidas</p></article>
    </section>
    {canSell && <section className="mt-5"><RetailSaleForm variants={variants} clients={clientRows} canDiscount={canDiscount} /></section>}
    <section className="panel mt-5"><h2 className="text-lg font-extrabold">Histórico de vendas</h2><div className="mt-4 divide-y">
      {sales.length === 0 && <p className="py-6 text-center text-sm text-muted">Nenhuma venda registrada.</p>}
      {sales.map((sale) => <article className="grid gap-3 py-4 lg:grid-cols-[1fr_auto]" key={sale.id}>
        <div><div className="flex flex-wrap items-center gap-2"><p className="font-extrabold">Venda #{sale.id.slice(0, 8)}</p><span className="status-pill">{sale.status === "completed" ? "Concluída" : sale.status === "refunded" ? "Estornada" : "Cancelada"}</span></div><p className="text-xs text-muted">{sale.clientName || "Cliente não identificado"} · {sale.soldAt.toLocaleString("pt-BR")} · operador {sale.operatorName || "—"}</p><p className="mt-2 text-sm">{(itemsBySale.get(sale.id) ?? []).map((item) => `${item.quantity}× ${item.productName} · ${item.variantName}`).join("; ")}</p><p className="mt-1 text-xs text-muted">{payments.filter((item) => item.saleId === sale.id).map((item) => `${paymentLabels[item.method] ?? item.method}: ${currency(item.amount)}`).join(" + ") || paymentLabels[sale.paymentMethod ?? ""] || "Pagamento não informado"}</p>{sale.cancellationReason && <p className="mt-1 text-xs text-red-700">Motivo: {sale.cancellationReason}</p>}</div>
        <div className="flex flex-wrap items-start gap-2 lg:justify-end"><div className="mr-2 lg:text-right"><p className="text-xl font-extrabold text-brand">{currency(sale.total)}</p>{sale.discount > 0 && <p className="text-xs text-muted">subtotal {currency(sale.subtotal)} · desconto {currency(sale.discount)}</p>}</div><Link className="secondary-button" href={`/recibo/${sale.receiptToken}`} target="_blank">Reimprimir</Link>{canCancel && sale.status === "completed" && <ActionForm action={reverseRetailSale} successMessage="Venda revertida e estoque devolvido." className="flex flex-wrap gap-2"><input type="hidden" name="saleId" value={sale.id} /><select className="field" name="operation"><option value="refund">Estorno/devolução</option><option value="cancel">Cancelamento</option></select><input className="field" name="reason" required minLength={5} placeholder="Motivo obrigatório" /><ConfirmSubmitButton className="secondary-button text-red-700" message="Confirmar a reversão? Os itens retornarão ao estoque.">Reverter</ConfirmSubmitButton></ActionForm>}</div>
      </article>)}
    </div></section>
  </div>;
}
