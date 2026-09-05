import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { CheckCircle2, CircleDollarSign, Clock3, KanbanSquare, Plus, Target, UsersRound } from "lucide-react";
import Link from "next/link";

import {
  closeCrmOpportunity,
  completeCrmTask,
  createCrmLead,
  initializeCrm,
  moveCrmOpportunity,
} from "@/actions/crm";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { PhoneInput } from "@/components/phone-input";
import { db } from "@/db";
import { crmLeads, crmOpportunities, crmPipelines, crmStages, crmTasks, organizationMembers, users } from "@/db/schema";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "CRM" };

function currency(value: number | null) {
  return value === null ? "Valor não informado" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
}

export default async function CrmPage() {
  const { organization } = await requireOrganization();
  const [pipelines, stages, opportunities, tasks, members] = await Promise.all([
    db.select().from(crmPipelines).where(eq(crmPipelines.organizationId, organization.id)).orderBy(desc(crmPipelines.isDefault)),
    db.select().from(crmStages).where(eq(crmStages.organizationId, organization.id)).orderBy(asc(crmStages.position)),
    db.select({
      id: crmOpportunities.id,
      title: crmOpportunities.title,
      valueInCents: crmOpportunities.valueInCents,
      stageId: crmOpportunities.stageId,
      pipelineId: crmOpportunities.pipelineId,
      status: crmOpportunities.status,
      nextActionAt: crmOpportunities.nextActionAt,
      expectedCloseDate: crmOpportunities.expectedCloseDate,
      leadId: crmLeads.id,
      leadName: crmLeads.name,
      company: crmLeads.company,
      source: crmOpportunities.source,
      owner: users.name,
    }).from(crmOpportunities)
      .leftJoin(crmLeads, eq(crmLeads.id, crmOpportunities.leadId))
      .leftJoin(users, eq(users.id, crmOpportunities.assignedUserId))
      .where(and(eq(crmOpportunities.organizationId, organization.id), eq(crmOpportunities.status, "open")))
      .orderBy(desc(crmOpportunities.updatedAt)),
    db.select({
      id: crmTasks.id,
      title: crmTasks.title,
      type: crmTasks.type,
      dueAt: crmTasks.dueAt,
      opportunityId: crmTasks.opportunityId,
      owner: users.name,
    }).from(crmTasks).leftJoin(users, eq(users.id, crmTasks.assignedUserId))
      .where(and(eq(crmTasks.organizationId, organization.id), isNull(crmTasks.completedAt)))
      .orderBy(asc(crmTasks.dueAt)).limit(12),
    db.select({ id: users.id, name: users.name }).from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, organization.id)).orderBy(asc(users.name)),
  ]);
  const pipeline = pipelines[0];
  const pipelineStages = pipeline ? stages.filter((stage) => stage.pipelineId === pipeline.id) : [];
  const totalValue = opportunities.reduce((sum, item) => sum + (item.valueInCents ?? 0), 0);
  const overdue = tasks.filter((task) => task.dueAt < new Date()).length;

  return (
    <div className="page-wrap">
      <PageHeader eyebrow={organization.name} title="CRM comercial" description="Acompanhe contatos, oportunidades, responsáveis e próximas ações em um só lugar." />
      <nav className="mb-5 flex flex-wrap gap-2 text-sm font-bold"><Link className="secondary-button" href="/crm/inbox">Conversas</Link><Link className="secondary-button" href="/crm/propostas">Propostas</Link><Link className="secondary-button" href="/crm/relatorios">Relatórios</Link><Link className="secondary-button" href="/crm/configuracoes">Configurações</Link></nav>

      {!pipeline ? (
        <section className="panel mx-auto max-w-2xl text-center">
          <KanbanSquare className="mx-auto size-10 text-brand" />
          <h2 className="mt-4 text-2xl font-extrabold">Prepare seu primeiro funil</h2>
          <p className="mt-2 text-muted">O Aggenda criará as etapas Novo contato, Qualificado, Demonstração, Proposta e Negociação.</p>
          <ActionForm action={initializeCrm} successMessage="Funil comercial criado." className="mt-5">
            <button className="primary-button">Criar funil comercial</button>
          </ActionForm>
        </section>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="panel"><Target className="size-5 text-brand" /><p className="mt-5 text-3xl font-extrabold">{opportunities.length}</p><p className="text-sm text-muted">oportunidades abertas</p></article>
            <article className="panel"><CircleDollarSign className="size-5 text-brand" /><p className="mt-5 text-3xl font-extrabold">{currency(totalValue)}</p><p className="text-sm text-muted">valor no funil</p></article>
            <article className="panel"><Clock3 className="size-5 text-brand" /><p className="mt-5 text-3xl font-extrabold">{tasks.length}</p><p className="text-sm text-muted">próximas atividades</p></article>
            <article className="panel"><UsersRound className="size-5 text-brand" /><p className="mt-5 text-3xl font-extrabold">{overdue}</p><p className="text-sm text-muted">atividades atrasadas</p></article>
          </section>

          <details className="panel mt-5">
            <summary className="flex cursor-pointer items-center gap-2 font-extrabold text-brand"><Plus className="size-4" /> Nova oportunidade</summary>
            <ActionForm action={createCrmLead} successMessage="Lead e oportunidade criados." className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <input type="hidden" name="pipelineId" value={pipeline.id} />
              <input type="hidden" name="stageId" value={pipelineStages[0]?.id} />
              <input className="field" name="name" required placeholder="Nome do contato" />
              <input className="field" name="company" placeholder="Empresa (opcional)" />
              <PhoneInput name="phone" placeholder="WhatsApp: (71) 99999-9999" />
              <input className="field" name="email" type="email" placeholder="E-mail" />
              <input className="field md:col-span-2" name="title" placeholder="Título da oportunidade" />
              <input className="field" name="value" inputMode="decimal" placeholder="Valor estimado (R$)" />
              <select className="field" name="source" defaultValue="manual"><option value="manual">Cadastro manual</option><option value="whatsapp">WhatsApp</option><option value="indicacao">Indicação</option><option value="instagram">Instagram</option><option value="google">Google</option><option value="site">Site</option><option value="outro">Outro</option></select>
              <select className="field" name="assignedUserId" defaultValue={members[0]?.id}>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select>
              <label className="grid gap-1 text-xs font-bold text-muted">Previsão de fechamento<input className="field" name="expectedCloseDate" type="date" /></label>
              <label className="grid gap-1 text-xs font-bold text-muted">Próxima ação<input className="field" name="nextActionAt" type="datetime-local" /></label>
              <textarea className="field min-h-20 md:col-span-2" name="notes" placeholder="Contexto e necessidade do lead" />
              <button className="primary-button md:self-end">Adicionar ao funil</button>
            </ActionForm>
          </details>

          <section className="mt-5 overflow-x-auto pb-3">
            <div className="grid min-w-[1100px] gap-4" style={{ gridTemplateColumns: `repeat(${pipelineStages.length}, minmax(220px, 1fr))` }}>
              {pipelineStages.map((stage) => {
                const items = opportunities.filter((item) => item.stageId === stage.id);
                return <section className="rounded-2xl border bg-[#eef1ed] p-3" key={stage.id}>
                  <div className="flex items-center justify-between gap-2 px-1"><h2 className="font-extrabold">{stage.name}</h2><span className="status-pill">{items.length}</span></div>
                  <p className="px-1 text-xs text-muted">{stage.probability}% de probabilidade</p>
                  <div className="mt-3 grid gap-3">
                    {items.map((item) => <article className="rounded-xl border bg-white p-4 shadow-sm" key={item.id}>
                      <Link className="font-extrabold hover:text-brand" href={`/crm/leads/${item.leadId}`}>{item.title}</Link>
                      <p className="mt-1 text-sm text-muted">{item.leadName}{item.company ? ` · ${item.company}` : ""}</p>
                      <p className="mt-3 font-extrabold text-brand">{currency(item.valueInCents)}</p>
                      <p className="mt-1 text-xs text-muted">{item.owner ?? "Sem responsável"} · {item.source}</p>
                      {item.nextActionAt && <p className={`mt-2 text-xs font-bold ${item.nextActionAt < new Date() ? "text-red-700" : "text-muted"}`}>Próxima ação: {item.nextActionAt.toLocaleString("pt-BR")}</p>}
                      <ActionForm action={moveCrmOpportunity} successMessage="Oportunidade movimentada." className="mt-3">
                        <input type="hidden" name="opportunityId" value={item.id} />
                        <select className="field py-2 text-xs" name="stageId" defaultValue={stage.id}>{pipelineStages.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
                        <button className="mt-2 w-full rounded-lg border px-2 py-1.5 text-xs font-bold text-brand">Mover</button>
                      </ActionForm>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <ActionForm action={closeCrmOpportunity} successMessage="Oportunidade ganha."><input type="hidden" name="opportunityId" value={item.id} /><input type="hidden" name="status" value="won" /><button className="w-full rounded-lg bg-[#edf7f1] px-2 py-1.5 text-xs font-bold text-brand">Ganha</button></ActionForm>
                        <ActionForm action={closeCrmOpportunity} successMessage="Oportunidade encerrada."><input type="hidden" name="opportunityId" value={item.id} /><input type="hidden" name="status" value="lost" /><button className="w-full rounded-lg bg-red-50 px-2 py-1.5 text-xs font-bold text-red-700">Perdida</button></ActionForm>
                      </div>
                    </article>)}
                    {!items.length && <p className="rounded-xl border border-dashed bg-white/60 p-5 text-center text-xs text-muted">Nenhuma oportunidade</p>}
                  </div>
                </section>;
              })}
            </div>
          </section>

          <section className="panel mt-2">
            <h2 className="text-xl font-extrabold">Próximas atividades</h2>
            <div className="mt-4 divide-y">
              {tasks.map((task) => <div className="flex flex-wrap items-center gap-3 py-3" key={task.id}>
                <Clock3 className={`size-4 ${task.dueAt < new Date() ? "text-red-700" : "text-brand"}`} />
                <div className="min-w-0 flex-1"><p className="font-bold">{task.title}</p><p className="text-xs text-muted">{task.type} · {task.owner ?? "Sem responsável"} · {task.dueAt.toLocaleString("pt-BR")}</p></div>
                <ActionForm action={completeCrmTask} successMessage="Atividade concluída."><input type="hidden" name="taskId" value={task.id} /><button className="icon-button" aria-label="Concluir atividade"><CheckCircle2 className="size-4" /></button></ActionForm>
              </div>)}
              {!tasks.length && <p className="empty-state">Nenhuma atividade pendente.</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
