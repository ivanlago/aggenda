import { formatOrganizationDateTime } from "@/lib/organization-time";
import { paymentMethodLabel } from "@/lib/presentation-labels";
import { ListPagination } from "@/components/list-pagination";
import { parseListPage } from "@/lib/list-pagination";
import { retailSaleStatusLabels } from "@/lib/retail-sale-status";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db";
import { clients, retailSaleItems, retailSalePayments, retailSales, users } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { requireOrganization } from "@/lib/session";

const money = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function SalesHistoryPage({ searchParams }: { searchParams: Promise<{ q?: string; pagina?: string }> }) {
  const { organization } = await requireOrganization();
  const params = await searchParams;
  const { q = "" } = params;
  const query = q.trim().slice(0, 80);
  const condition = query ? and(eq(retailSales.organizationId, organization.id), or(ilike(clients.name, `%${query}%`), sql`exists (select 1 from retail_sale_items i where i.sale_id = ${retailSales.id} and i.organization_id = ${organization.id} and i.product_name ilike ${`%${query}%`})`)) : eq(retailSales.organizationId, organization.id);
  const [{ total }] = await db.select({ total: count() }).from(retailSales).leftJoin(clients, eq(clients.id, retailSales.clientId)).where(condition);
  const page = Math.min(parseListPage(params.pagina), Math.max(1, Math.ceil(total / 20)));
  const selectedSales = await db.select({ id: retailSales.id }).from(retailSales).leftJoin(clients, eq(clients.id, retailSales.clientId)).where(condition).orderBy(desc(retailSales.soldAt), desc(retailSales.id)).limit(20).offset((page - 1) * 20);
  const saleIds = selectedSales.map(sale => sale.id);
  const rows = saleIds.length ? await db.select({ id: retailSales.id, receiptToken: retailSales.receiptToken, paymentProvider: retailSales.paymentProvider, status: retailSales.status, client: clients.name, operator: users.name, soldAt: retailSales.soldAt, total: retailSales.totalInCents, discount: retailSales.discountInCents, product: retailSaleItems.productName, variant: retailSaleItems.variantName, quantity: retailSaleItems.quantity })
    .from(retailSales).leftJoin(clients, eq(clients.id, retailSales.clientId)).leftJoin(users, eq(users.id, retailSales.createdByUserId)).innerJoin(retailSaleItems, eq(retailSaleItems.saleId, retailSales.id)).where(and(eq(retailSales.organizationId, organization.id), inArray(retailSales.id, saleIds))).orderBy(desc(retailSales.soldAt), desc(retailSales.id), retailSaleItems.id) : [];
  const payments = saleIds.length ? await db.select({ saleId: retailSalePayments.saleId, method: retailSalePayments.method, amount: retailSalePayments.amountInCents }).from(retailSalePayments).where(and(eq(retailSalePayments.organizationId, organization.id), inArray(retailSalePayments.saleId, saleIds))) : [];
  const grouped = new Map<string, { sale: (typeof rows)[number]; items: string[] }>();
  for (const row of rows) { const entry = grouped.get(row.id) ?? { sale: row, items: [] }; entry.items.push(`${row.quantity}× ${row.product} · ${row.variant}`); grouped.set(row.id, entry); }
  return <div className="page-wrap"><Link className="mb-4 inline-flex text-sm font-bold text-brand" href="/vendas">← Voltar ao PDV</Link><PageHeader eyebrow="PDV" title="Histórico detalhado" description="Consulte operador, cliente, itens, pagamentos, situação e reimprima qualquer recibo." />
    <form className="panel mb-5 flex gap-2"><label className="grid min-w-0 gap-2 text-sm font-bold">Buscar por cliente ou produto<input className="field min-w-0 flex-1" type="search" name="q" defaultValue={query} placeholder="Buscar por cliente ou produto" /></label><button className="secondary-button">Buscar</button></form>
    <section className="panel divide-y">{[...grouped.values()].map(({ sale, items }) => <article className="grid gap-3 py-4 lg:grid-cols-[1fr_auto]" key={sale.id}><div><div className="flex flex-wrap gap-2"><strong>Venda #{sale.id.slice(0, 8)}</strong><span className="status-pill">{retailSaleStatusLabels[sale.status] ?? sale.status}</span></div><p className="text-xs text-muted">{formatOrganizationDateTime(sale.soldAt, organization.timezone)} · {sale.client || "Cliente não identificado"} · operador {sale.operator || "—"}</p><p className="mt-2 text-sm">{items.join("; ")}</p><p className="mt-1 text-xs text-muted">{payments.filter((item) => item.saleId === sale.id).map((item) => `${paymentMethodLabel(item.method)} ${money(item.amount)}`).join(" + ")}</p></div><div className="flex items-start gap-2"><strong className="text-lg text-brand">{money(sale.total)}</strong>{sale.paymentProvider ? <Link className="secondary-button" href={`/vendas/pagamento/${sale.id}`}>Acompanhar pagamento</Link> : <Link className="secondary-button" href={`/recibo/${sale.receiptToken}`} target="_blank">Reimprimir</Link>}</div></article>)}{!grouped.size && <p className="empty-state">Nenhuma venda encontrada.</p>}</section>
    <ListPagination path="/vendas/historico" query={{ q: query }} page={page} total={total} />
  </div>;
}
