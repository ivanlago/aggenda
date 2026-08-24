import { and, asc, eq, gte, lt } from "drizzle-orm";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { retailSaleItems, retailSalePayments, retailSales, users } from "@/db/schema";
import { requireOrganization } from "@/lib/session";

const money = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const labels: Record<string, string> = { cash: "Espécie", card: "Cartões", pix: "PIX" };

export default async function SalesReportsPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { organization } = await requireOrganization();
  const query = await searchParams;
  const fallback = new Date().toISOString().slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(query.mes ?? "") ? query.mes! : fallback;
  const start = new Date(`${month}-01T00:00:00`);
  const end = new Date(start); end.setMonth(end.getMonth() + 1);
  const sales = await db.select({ id: retailSales.id, operator: users.name, total: retailSales.totalInCents, discount: retailSales.discountInCents }).from(retailSales).leftJoin(users, eq(users.id, retailSales.createdByUserId)).where(and(eq(retailSales.organizationId, organization.id), eq(retailSales.status, "completed"), gte(retailSales.soldAt, start), lt(retailSales.soldAt, end)));
  const ids = new Set(sales.map((sale) => sale.id));
  const [items, payments] = await Promise.all([
    db.select({ saleId: retailSaleItems.saleId, name: retailSaleItems.productName, variant: retailSaleItems.variantName, quantity: retailSaleItems.quantity, total: retailSaleItems.totalInCents, cost: retailSaleItems.unitCostInCents, commission: retailSaleItems.commissionInCents }).from(retailSaleItems).where(eq(retailSaleItems.organizationId, organization.id)).orderBy(asc(retailSaleItems.productName)),
    db.select({ saleId: retailSalePayments.saleId, method: retailSalePayments.method, amount: retailSalePayments.amountInCents }).from(retailSalePayments).where(eq(retailSalePayments.organizationId, organization.id)),
  ]);
  const validItems = items.filter((item) => ids.has(item.saleId)); const validPayments = payments.filter((item) => ids.has(item.saleId));
  const revenue = sales.reduce((sum, item) => sum + item.total, 0); const discounts = sales.reduce((sum, item) => sum + item.discount, 0); const cost = validItems.reduce((sum, item) => sum + item.cost * item.quantity, 0); const commissions = validItems.reduce((sum, item) => sum + item.commission, 0);
  const products = new Map<string, { quantity: number; revenue: number; margin: number; commission: number }>();
  for (const item of validItems) { const key = `${item.name} · ${item.variant}`; const row = products.get(key) ?? { quantity: 0, revenue: 0, margin: 0, commission: 0 }; row.quantity += item.quantity; row.revenue += item.total; row.margin += item.total - item.cost * item.quantity; row.commission += item.commission; products.set(key, row); }
  const byPayment = new Map<string, number>(); for (const item of validPayments) byPayment.set(item.method, (byPayment.get(item.method) ?? 0) + item.amount);
  const byOperator = new Map<string, { sales: number; revenue: number; commission: number }>(); for (const sale of sales) { const name = sale.operator || "Sem operador"; const row = byOperator.get(name) ?? { sales: 0, revenue: 0, commission: 0 }; row.sales++; row.revenue += sale.total; row.commission += validItems.filter((item) => item.saleId === sale.id).reduce((sum, item) => sum + item.commission, 0); byOperator.set(name, row); }
  return <div className="page-wrap"><Link className="mb-4 inline-flex text-sm font-bold text-brand" href="/vendas">← Voltar ao PDV</Link><PageHeader eyebrow="PDV" title="Relatórios de vendas" description="Caixa, vendas, produtos, margem bruta e comissões do varejo." />
    <form className="mb-5 flex gap-2"><input className="field" type="month" name="mes" defaultValue={month} /><button className="secondary-button">Atualizar</button></form>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[["Vendas", String(sales.length)], ["Receita", money(revenue)], ["Descontos", money(discounts)], ["Margem bruta", money(revenue - cost)], ["Comissões", money(commissions)]].map(([label, value]) => <article className="panel" key={label}><p className="text-xs font-bold text-muted">{label}</p><p className="mt-2 text-2xl font-extrabold">{value}</p></article>)}</section>
    <div className="mt-5 grid gap-5 xl:grid-cols-2"><section className="panel"><h2 className="font-extrabold">Caixa por pagamento</h2><div className="mt-3 divide-y">{[...byPayment].map(([method, value]) => <p className="flex justify-between py-3 text-sm" key={method}><span>{labels[method] ?? method}</span><strong>{money(value)}</strong></p>)}</div></section><section className="panel"><h2 className="font-extrabold">Operadores e comissões</h2><div className="mt-3 divide-y">{[...byOperator].map(([name, row]) => <div className="grid grid-cols-3 gap-2 py-3 text-sm" key={name}><strong>{name}</strong><span>{row.sales} vendas · {money(row.revenue)}</span><span className="text-right">comissão {money(row.commission)}</span></div>)}</div></section></div>
    <section className="panel mt-5"><h2 className="font-extrabold">Produtos e margem</h2><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead><tr className="border-b text-xs text-muted"><th className="py-3">Produto/variação</th><th>Quantidade</th><th>Receita</th><th>Margem bruta</th><th>Comissão</th></tr></thead><tbody>{[...products].map(([name, row]) => <tr className="border-b" key={name}><td className="py-3 font-bold">{name}</td><td>{row.quantity}</td><td>{money(row.revenue)}</td><td>{money(row.margin)}</td><td>{money(row.commission)}</td></tr>)}</tbody></table></div></section>
  </div>;
}
