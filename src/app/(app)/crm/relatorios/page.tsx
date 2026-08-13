import { eq } from "drizzle-orm";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { crmOpportunities, crmStages } from "@/db/schema";
import { requireOrganization } from "@/lib/session";

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
export default async function CrmReportsPage() {
  const { organization } = await requireOrganization();
  const opportunities = await db.select({ status: crmOpportunities.status, value: crmOpportunities.valueInCents, source: crmOpportunities.source, stage: crmStages.name }).from(crmOpportunities).innerJoin(crmStages, eq(crmStages.id, crmOpportunities.stageId)).where(eq(crmOpportunities.organizationId, organization.id));
  const won = opportunities.filter((item) => item.status === "won"); const lost = opportunities.filter((item) => item.status === "lost"); const closed = won.length + lost.length; const revenue = won.reduce((sum, item) => sum + (item.value ?? 0), 0);
  const sources = [...new Set(opportunities.map((item) => item.source))].map((source) => ({ source, total: opportunities.filter((item) => item.source === source).length, won: opportunities.filter((item) => item.source === source && item.status === "won").length }));
  return <div className="page-wrap"><Link className="mb-4 inline-flex text-sm font-bold text-brand" href="/crm">← Voltar ao funil</Link><PageHeader eyebrow={organization.name} title="Relatórios do CRM" description="Conversão, receita e origem das oportunidades." /><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><article className="panel"><p className="text-3xl font-extrabold">{opportunities.length}</p><p className="text-sm text-muted">oportunidades</p></article><article className="panel"><p className="text-3xl font-extrabold">{closed ? Math.round(won.length / closed * 100) : 0}%</p><p className="text-sm text-muted">conversão entre encerradas</p></article><article className="panel"><p className="text-3xl font-extrabold">{money(revenue)}</p><p className="text-sm text-muted">receita ganha</p></article><article className="panel"><p className="text-3xl font-extrabold">{lost.length}</p><p className="text-sm text-muted">oportunidades perdidas</p></article></section><section className="panel mt-5"><h2 className="text-xl font-extrabold">Desempenho por origem</h2><div className="mt-4 divide-y">{sources.map((item) => <div className="grid grid-cols-3 gap-3 py-3 text-sm" key={item.source}><strong>{item.source}</strong><span>{item.total} oportunidades</span><span>{item.won} ganhas</span></div>)}</div></section></div>;
}
