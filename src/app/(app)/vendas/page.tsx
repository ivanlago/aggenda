import { formatOrganizationDateTime } from "@/lib/organization-time";
import { paymentMethodLabel } from "@/lib/presentation-labels";
import { PaginatedCollection } from "@/components/paginated-collection";
import { commissionBeneficiaries } from "@/lib/commission-beneficiaries";
import { SalesWorkspace } from "@/components/sales-workspace";
import { RetailQuoteForm } from "@/components/retail-quote-form";
import { RetailQuoteLibrary } from "@/components/retail-quote-library";
import { SalesHistoryTabs } from "@/components/sales-history-tabs";
import { requireRetailQuote } from "@/lib/retail-quotes";
import { organizationDate, organizationDayRange } from "@/lib/appointment-safety";
import { getPosOfferings, getPosProducts } from "@/lib/pos-catalog";
import { packageSaleSelection } from "@/lib/package-catalog";
import { getPosPackageBalances } from "@/lib/pos-package-balances";
import { posPaymentSettings } from "@/lib/pos-payment-settings";
import { retailSaleStatusLabels } from "@/lib/retail-sale-status";
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { BadgeDollarSign, PackageCheck, ShoppingBag } from "lucide-react";
import Link from "next/link";

import { reverseRetailSale } from "@/actions/retail";
import { ActionForm } from "@/components/action-form";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { PageHeader } from "@/components/page-header";
import { RetailSaleForm } from "@/components/retail-sale-form";
import { db } from "@/db";
import { clients, retailSaleItems, retailSalePayments, retailSales, users } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

const currency = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const metadata = { title: "Venda e orçamento" };

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ inicio?: string; novo?: string; convert?: string; quote?: string; search?: string; page?: string; history?: string; pacote?: string; tipo?: string; modo?: string }> }) {
  const params = await searchParams;
  const { organization } = await requireOrganization();
  const commissionChoices = await commissionBeneficiaries(db, organization.id);
  const canSell = hasOrganizationPermission(organization.role, "sales.sell") || hasOrganizationPermission(organization.role, "inventory.manage");
  const canDiscount = hasOrganizationPermission(organization.role, "sales.discount");
  const canCancel = hasOrganizationPermission(organization.role, "sales.cancel");
  const posSettings = await posPaymentSettings(organization.id);
  const showAllHistory = params.history === "all";
  const historyRange = organizationDayRange(new Date(), organization.timezone);
  const [variantRows, clientRows, sales, items, payments] = await Promise.all([
    getPosProducts(organization.id),
    db.select({ id: clients.id, name: clients.name, email: clients.email, phone: clients.phone }).from(clients).where(eq(clients.organizationId, organization.id)).orderBy(asc(clients.name)),
    db.select({ id: retailSales.id, clientName: clients.name, operatorName: users.name, paymentMethod: retailSales.paymentMethod, receiptToken: retailSales.receiptToken, paymentProvider: retailSales.paymentProvider, status: retailSales.status, subtotal: retailSales.subtotalInCents, discount: retailSales.discountInCents, total: retailSales.totalInCents, soldAt: retailSales.soldAt, cancellationReason: retailSales.cancellationReason })
      .from(retailSales).leftJoin(clients, eq(clients.id, retailSales.clientId)).leftJoin(users, eq(users.id, retailSales.createdByUserId)).where(and(eq(retailSales.organizationId, organization.id), !showAllHistory ? and(gte(retailSales.soldAt, historyRange.start), lt(retailSales.soldAt, historyRange.end)) : undefined)).orderBy(desc(retailSales.soldAt)).limit(showAllHistory ? 30 : 20),
    db.select({ saleId: retailSaleItems.saleId, productName: retailSaleItems.productName, variantName: retailSaleItems.variantName, quantity: retailSaleItems.quantity, total: retailSaleItems.totalInCents })
      .from(retailSaleItems).where(eq(retailSaleItems.organizationId, organization.id)),
    db.select({ saleId: retailSalePayments.saleId, method: retailSalePayments.method, amount: retailSalePayments.amountInCents }).from(retailSalePayments).where(eq(retailSalePayments.organizationId, organization.id)),
  ]);
  const [offerings, packageBalances] = canSell ? await Promise.all([
    getPosOfferings(organization.id),
    getPosPackageBalances(organization.id),
  ]) : [[], []];
  const variants = variantRows;
  const quoteProducts = variantRows;
  const sourceQuote = params.convert && canSell ? (await requireRetailQuote(params.convert)).quote : null;
  const packageSelection = packageSaleSelection(params.pacote, offerings);
  const today = organizationDate(new Date(), organization.timezone);
  const conversionBlocked = sourceQuote?.saleId ? "Este orçamento já foi convertido em venda." : sourceQuote && sourceQuote.validUntil < today ? "Este orçamento está vencido." : null;
  const saleCatalog = sourceQuote ? sourceQuote.items.map((line) => {
    const current = [...quoteProducts, ...offerings].find((item) => item.id === line.variantId);
    return { id: line.variantId, label: line.label, barcode: current?.barcode ?? null, priceInCents: line.unitPriceInCents, stock: current?.stock ?? 0, kind: line.kind, unavailableReason: !current ? "Item indisponível no catálogo." : "unavailableReason" in current ? current.unavailableReason : undefined };
  }) : variants;
  const missingStock = sourceQuote?.items.some((line) => { const item = saleCatalog.find((entry) => entry.id === line.variantId); return !item || item.stock < line.quantity || ("unavailableReason" in item && Boolean(item.unavailableReason)); });
  const totalSold = sales.reduce((sum, sale) => sum + (sale.status === "completed" ? sale.total : 0), 0);
  const visibleSaleIds = new Set(sales.filter(sale => sale.status === "completed").map((sale) => sale.id));
  const itemsBySale = new Map<string, typeof items>();
  let unitsSold = 0;
  for (const item of items) {
    if (!visibleSaleIds.has(item.saleId)) continue;
    unitsSold += item.quantity;
    itemsBySale.set(item.saleId, [...(itemsBySale.get(item.saleId) ?? []), item]);
  }

  return <div className="page-wrap">
    <PageHeader eyebrow="Varejo" title="Venda e orçamento" description="Venda produtos, procedimentos e pacotes ou prepare um orçamento para converter em venda depois." />
    <nav className="mb-5 flex flex-wrap gap-2"><Link className="secondary-button" href="/vendas/historico">Histórico completo</Link><Link className="secondary-button" href="/vendas/relatorios">Relatórios do PDV</Link></nav>
    <section className="grid gap-4 sm:grid-cols-3">
      <article className="panel"><ShoppingBag className="size-5 text-brand" /><p className="mt-4 text-3xl font-extrabold">{sales.length}</p><p className="text-sm text-muted">vendas recentes</p></article>
      <article className="panel"><PackageCheck className="size-5 text-brand" /><p className="mt-4 text-3xl font-extrabold">{unitsSold}</p><p className="text-sm text-muted">unidades vendidas</p></article>
      <article className="panel"><BadgeDollarSign className="size-5 text-brand" /><p className="mt-4 text-2xl font-extrabold">{currency(totalSold)}</p><p className="text-sm text-muted">nas vendas exibidas</p></article>
    </section>
    {params.pacote && !sourceQuote && <p className={`panel mt-5 text-sm ${packageSelection.error ? "text-amber-800" : "text-brand"}`}>{packageSelection.error ?? "Pacote adicionado ao carrinho. Selecione o cliente e confira o recebimento para concluir a venda."}</p>}
    {canSell && <SalesWorkspace initialMode={params.modo === "orcamento" ? "quote" : "sale"} key={sourceQuote?.id ?? `new-${params.pacote ?? params.inicio ?? (params.novo === "1" ? "sale" : "default")}-${params.tipo ?? "all"}`} sale={conversionBlocked || missingStock ? <p className="panel text-sm text-amber-800">{conversionBlocked || "Há itens indisponíveis ou sem estoque suficiente. Atualize o catálogo/estoque antes de converter este orçamento."}</p> : <RetailSaleForm initialItemType={params.pacote || params.tipo === "package" ? "package" : "all"} paymentProviders={posSettings.providers} defaultPaymentProvider={posSettings.defaultProvider} commissionChoices={commissionChoices} quoteId={sourceQuote?.id} initialClientId={sourceQuote?.clientId ?? undefined} initialCart={sourceQuote?.items ?? packageSelection.cart} offerings={sourceQuote ? [] : offerings} variants={saleCatalog} clients={clientRows} canDiscount={canDiscount} packageBalances={packageBalances} timezone={organization.timezone} />} quote={<RetailQuoteForm catalog={[...quoteProducts, ...offerings]} clients={clientRows} canDiscount={canDiscount} defaultValidity={organizationDate(new Date(new Date().getTime() + 30 * 86400000), organization.timezone)} />} />}
    <SalesHistoryTabs initialTab={params.quote ? "quotes" : "sales"} quotes={<RetailQuoteLibrary selectedId={params.quote} search={params.search} page={Number(params.page ?? 1)} showAll={showAllHistory} />} sales={<section className="panel mt-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-extrabold">Vendas {showAllHistory ? "salvas" : "de hoje"}</h2><Link className="secondary-button" href={`/vendas?history=${showAllHistory ? "today" : "all"}#historico-vendas`}>{showAllHistory ? "Mostrar somente hoje" : "Ver anteriores"}</Link></div><PaginatedCollection label="Registros" className="mt-4 divide-y">
      {sales.length === 0 && <p className="py-6 text-center text-sm text-muted">Nenhuma venda registrada.</p>}
      {sales.map((sale) => <article className="grid gap-3 py-4 lg:grid-cols-[1fr_auto]" key={sale.id}>
        <div><div className="flex flex-wrap items-center gap-2"><p className="font-extrabold">Venda #{sale.id.slice(0, 8)}</p><span className="status-pill">{retailSaleStatusLabels[sale.status] ?? sale.status}</span></div><p className="text-xs text-muted">{sale.clientName || "Cliente não identificado"} · {formatOrganizationDateTime(sale.soldAt, organization.timezone)} · operador {sale.operatorName || "—"}</p><p className="mt-2 text-sm">{(itemsBySale.get(sale.id) ?? []).map((item) => `${item.quantity}× ${item.productName} · ${item.variantName}`).join("; ")}</p><p className="mt-1 text-xs text-muted">{payments.filter((item) => item.saleId === sale.id).map((item) => `${paymentMethodLabel(item.method)}: ${currency(item.amount)}`).join(" + ") || (sale.paymentMethod ? paymentMethodLabel(sale.paymentMethod) : "") || "Pagamento não informado"}</p>{sale.cancellationReason && <p className="mt-1 text-xs text-red-700">Motivo: {sale.cancellationReason}</p>}</div>
        <div className="flex flex-wrap items-start gap-2 lg:justify-end"><div className="mr-2 lg:text-right"><p className="text-xl font-extrabold text-brand">{currency(sale.total)}</p>{sale.discount > 0 && <p className="text-xs text-muted">subtotal {currency(sale.subtotal)} · desconto {currency(sale.discount)}</p>}</div>{sale.paymentProvider ? <Link className="secondary-button" href={`/vendas/pagamento/${sale.id}`}>Acompanhar pagamento</Link> : <Link className="secondary-button" href={`/recibo/${sale.receiptToken}`} target="_blank">Reimprimir</Link>}{canCancel && !sale.paymentProvider && sale.status === "completed" && <ActionForm action={reverseRetailSale} successMessage="Venda revertida e estoque devolvido." className="flex flex-wrap gap-2"><input type="hidden" name="saleId" value={sale.id} /><label className="grid min-w-0 gap-2 text-sm font-bold">Operação<select className="field" name="operation"><option value="refund">Estorno/devolução</option><option value="cancel">Cancelamento</option></select></label><label className="grid min-w-0 gap-2 text-sm font-bold">Motivo<input className="field" name="reason" required minLength={5} placeholder="Motivo obrigatório" /></label><ConfirmSubmitButton className="secondary-button text-red-700" message="Confirmar a reversão? Produtos retornarão ao estoque e pacotes sem uso serão cancelados.">Reverter</ConfirmSubmitButton></ActionForm>}</div>
      </article>)}
    </PaginatedCollection></section>} />
  </div>;
}
