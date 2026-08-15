import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";

import { createCommissionRule, generateCommissions, markCommissionPaid } from "@/actions/financial-operations";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { commissionEntries, commissionRules, professionals, services } from "@/db/schema";
import { organizationDate } from "@/lib/appointment-safety";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Comissões" };
const money = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function CommissionsPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { organization } = await requireOrganization();
  const query = await searchParams;
  const current = organizationDate(new Date(), organization.timezone).slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(query.mes ?? "") ? query.mes! : current;
  const [professionalsList, servicesList, rules, commissions] = await Promise.all([
    db.select({ id: professionals.id, name: professionals.name }).from(professionals).where(eq(professionals.organizationId, organization.id)).orderBy(asc(professionals.name)),
    db.select({ id: services.id, name: services.name }).from(services).where(eq(services.organizationId, organization.id)).orderBy(asc(services.name)),
    db.select({ id: commissionRules.id, professional: professionals.name, service: services.name, type: commissionRules.calculationType, value: commissionRules.value }).from(commissionRules).innerJoin(professionals, eq(professionals.id, commissionRules.professionalId)).leftJoin(services, eq(services.id, commissionRules.serviceId)).where(eq(commissionRules.organizationId, organization.id)),
    db.select({ id: commissionEntries.id, professional: professionals.name, amount: commissionEntries.amountInCents, base: commissionEntries.baseAmountInCents, status: commissionEntries.status }).from(commissionEntries).innerJoin(professionals, eq(professionals.id, commissionEntries.professionalId)).where(and(eq(commissionEntries.organizationId, organization.id), eq(commissionEntries.competence, month))).orderBy(asc(professionals.name)),
  ]);
  const total = commissions.reduce((sum, item) => sum + item.amount, 0);

  return <div className="page-wrap">
    <Link className="mb-4 inline-flex text-sm font-bold text-brand" href={`/financeiro?mes=${month}`}>← Voltar ao fluxo de caixa</Link>
    <PageHeader eyebrow="Financeiro" title="Comissões" description="Configure regras, calcule valores por competência e controle os pagamentos dos profissionais." />
    <form className="panel mb-5 flex flex-wrap items-end gap-3" method="get"><label className="grid gap-1 text-xs font-bold">Competência<input className="field" defaultValue={month} name="mes" type="month" /></label><button className="secondary-button">Exibir período</button></form>
    <section className="grid gap-5 xl:grid-cols-2">
      <article className="panel"><h2 className="text-lg font-extrabold">Regras de comissão</h2><ActionForm action={createCommissionRule} successMessage="Regra criada." className="mt-4 grid gap-3 md:grid-cols-2"><select className="field" name="professionalId" required><option value="">Profissional</option>{professionalsList.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className="field" name="serviceId"><option value="">Todos os serviços</option>{servicesList.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className="field" name="calculationType"><option value="percentage">Percentual</option><option value="fixed">Valor fixo</option></select><input className="field" name="value" required inputMode="decimal" placeholder="Ex.: 10 (%) ou 25 (R$)" /><button className="primary-button">Criar regra</button></ActionForm><div className="mt-4 divide-y">{rules.map((item) => <p className="py-3 text-sm" key={item.id}><strong>{item.professional}</strong> · {item.service || "Todos os serviços"} · {item.type === "percentage" ? `${item.value / 100}%` : money(item.value)}</p>)}</div></article>
      <article className="panel"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-extrabold">Comissões de {month}</h2><p className="text-sm text-muted">Total {money(total)}</p></div><ActionForm action={generateCommissions} successMessage="Comissões calculadas."><input type="hidden" name="competence" value={month} /><button className="secondary-button">Calcular atendimentos concluídos</button></ActionForm></div><div className="mt-4 divide-y">{commissions.map((item) => <div className="flex items-center justify-between gap-3 py-3 text-sm" key={item.id}><span><strong>{item.professional}</strong><br /><span className="text-muted">Base {money(item.base)}</span></span><strong>{money(item.amount)}</strong>{item.status === "pending" ? <ActionForm action={markCommissionPaid} successMessage="Comissão paga."><input type="hidden" name="id" value={item.id} /><button className="secondary-button">Marcar paga</button></ActionForm> : <span className="status-pill">Paga</span>}</div>)}{!commissions.length && <p className="empty-state">Nenhuma comissão calculada nesta competência.</p>}</div></article>
    </section>
  </div>;
}
