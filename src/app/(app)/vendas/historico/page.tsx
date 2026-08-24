import { and, desc, eq, ilike, or } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db";
import { clients, retailSaleItems, retailSalePayments, retailSales, users } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { requireOrganization } from "@/lib/session";

const money = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const labels: Record<string, string> = { cash: "Espécie", card: "Cartões", pix: "PIX" };

export default async function SalesHistoryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { organization } = await requireOrganization();
  const { q = "" } = await searchParams;
  const query = q.trim().slice(0, 80);
  const condition = query ? and(eq(retailSales.organizationId, organization.id), or(ilike(clients.name, `%${query}%`), ilike(retailSaleItems.productName, `%${query}%`))) : eq(retailSales.organizationId, organization.id);
  const rows = await db.select({ id: retailSales.id, receiptToken: retailSales.receiptToken, status: retailSales.status, client: clients.name, operator: users.name, soldAt: retailSales.soldAt, total: retailSales.totalInCents, discount: retailSales.discountInCents, product: retailSaleItems.productName, variant: retailSaleItems.variantName, quantity: retailSaleItems.quantity })
    .from(retailSales).leftJoin(clients, eq(clients.id, retailSales.clientId)).leftJoin(users, eq(users.id, retailSales.createdByUserId)).innerJoin(retailSaleItems, eq(retailSaleItems.saleId, retailSales.id)).where(condition).orderBy(desc(retailSales.soldAt)).limit(500);
  const payments = await db.select({ saleId: retailSalePayments.saleId, method: retailSalePayments.method, amount: retailSalePayments.amountInCents }).from(retailSalePayments).where(eq(retailSalePayments.organizationId, organization.id));
  const grouped = new Map<string, { sale: (typeof rows)[number]; items: string[] }>();
  for (const row of rows) { const entry = grouped.get(row.id) ?? { sale: row, items: [] }; entry.items.push(`${row.quantity}× ${row.product} · ${row.variant}`); grouped.set(row.id, entry); }
  return <div className="page-wrap"><Link className="mb-4 inline-flex text-sm font-bold text-brand" href="/vendas">← Voltar ao PDV</Link><PageHeader eyebrow="PDV" title="Histórico detalhado" description="Consulte operador, cliente, itens, pagamentos, situação e reimprima qualquer recibo." />
    <form className="panel mb-5 flex gap-2"><input className="field min-w-0 flex-1" type="search" name="q" defaultValue={query} placeholder="Buscar por cliente ou produto" /><button className="secondary-button">Buscar</button></form>
    <section className="panel divide-y">{[...grouped.values()].map(({ sale, items }) => <article className="grid gap-3 py-4 lg:grid-cols-[1fr_auto]" key={sale.id}><div><div className="flex flex-wrap gap-2"><strong>Venda #{sale.id.slice(0, 8)}</strong><span className="status-pill">{sale.status === "completed" ? "Concluída" : sale.status === "refunded" ? "Estornada" : "Cancelada"}</span></div><p className="text-xs text-muted">{sale.soldAt.toLocaleString("pt-BR")} · {sale.client || "Cliente não identificado"} · operador {sale.operator || "—"}</p><p className="mt-2 text-sm">{items.join("; ")}</p><p className="mt-1 text-xs text-muted">{payments.filter((item) => item.saleId === sale.id).map((item) => `${labels[item.method] ?? item.method} ${money(item.amount)}`).join(" + ")}</p></div><div className="flex items-start gap-2"><strong className="text-lg text-brand">{money(sale.total)}</strong><Link className="secondary-button" href={`/recibo/${sale.receiptToken}`} target="_blank">Reimprimir</Link></div></article>)}{!grouped.size && <p className="empty-state">Nenhuma venda encontrada.</p>}</section>
  </div>;
}
