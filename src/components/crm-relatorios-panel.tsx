import { MetricCard } from "@/components/metric-card";
import Link from "next/link";
import { PaginatedCollection } from "@/components/paginated-collection";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { crmOpportunities, crmStages } from "@/db/schema";

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
export async function CrmReportsPanel({ organizationId }: { organizationId: string }) {
  const opportunities = await db.select({ status: crmOpportunities.status, value: crmOpportunities.valueInCents, source: crmOpportunities.source, stage: crmStages.name }).from(crmOpportunities).innerJoin(crmStages, eq(crmStages.id, crmOpportunities.stageId)).where(eq(crmOpportunities.organizationId, organizationId));
  const won = opportunities.filter((item) => item.status === "won"); const lost = opportunities.filter((item) => item.status === "lost"); const closed = won.length + lost.length; const revenue = won.reduce((sum, item) => sum + (item.value ?? 0), 0);
  const sources = [...new Set(opportunities.map((item) => item.source))].map((source) => ({ source, total: opportunities.filter((item) => item.source === source).length, won: opportunities.filter((item) => item.source === source && item.status === "won").length }));
  return <section className="mt-5 min-w-0"><div className="mb-5"><h2 className="text-lg font-extrabold">Indicadores do CRM</h2><p className="mt-1 text-sm text-muted">Conversão, valores ganhos e origem das oportunidades.</p><Link className="secondary-button mt-3" href="/relatorios?relatorio=origens">Emitir relatórios de CRM</Link></div><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="oportunidades" value={<>{opportunities.length}</>} /><MetricCard label="conversão entre encerradas" value={<>{closed ? Math.round(won.length / closed * 100) : 0}%</>} /><MetricCard label="valor das oportunidades ganhas" value={<>{money(revenue)}</>} /><MetricCard label="oportunidades perdidas" value={<>{lost.length}</>} /></section><section className="panel mt-5"><h2 className="text-xl font-extrabold">Desempenho por origem</h2><div className="mt-4 divide-y"><PaginatedCollection label="Registros" className="mt-4">{sources.map((item) => <div className="grid grid-cols-3 gap-3 py-3 text-sm" key={item.source}><strong>{item.source}</strong><span>{item.total} oportunidades</span><span>{item.won} ganhas</span></div>)}</PaginatedCollection></div></section></section>;
}
