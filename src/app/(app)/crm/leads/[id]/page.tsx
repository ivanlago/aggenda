import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { ArrowLeft, CheckCircle2, Clock3, UserCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { addCrmTag, completeCrmTask, convertCrmLeadToClient, createCrmProposal, createCrmTask, generateCrmAiInsight, reviewCrmAiInsight, setCrmCustomFieldValue } from "@/actions/crm";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { crmAiInsights, crmCustomFields, crmCustomFieldValues, crmLeadTags, crmLeads, crmOpportunities, crmProposalItems, crmProposals, crmStages, crmTags, crmTasks, organizationMembers, services, users } from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { formatPhone } from "@/lib/phone";

export default async function CrmLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organization } = await requireOrganization();
  const [lead] = await db.select({
    id: crmLeads.id, name: crmLeads.name, phone: crmLeads.phone, email: crmLeads.email,
    company: crmLeads.company, source: crmLeads.source, notes: crmLeads.notes,
    status: crmLeads.status, clientId: crmLeads.clientId, owner: users.name,
    assignedUserId: crmLeads.assignedUserId, createdAt: crmLeads.createdAt,
  }).from(crmLeads).leftJoin(users, eq(users.id, crmLeads.assignedUserId))
    .where(and(eq(crmLeads.id, id), eq(crmLeads.organizationId, organization.id))).limit(1);
  if (!lead) notFound();
  const [opportunities, tasks, members] = await Promise.all([
    db.select({ id: crmOpportunities.id, title: crmOpportunities.title, valueInCents: crmOpportunities.valueInCents, status: crmOpportunities.status, stage: crmStages.name, nextActionAt: crmOpportunities.nextActionAt })
      .from(crmOpportunities).innerJoin(crmStages, eq(crmStages.id, crmOpportunities.stageId))
      .where(and(eq(crmOpportunities.organizationId, organization.id), eq(crmOpportunities.leadId, id))).orderBy(desc(crmOpportunities.createdAt)),
    db.select({ id: crmTasks.id, title: crmTasks.title, type: crmTasks.type, notes: crmTasks.notes, dueAt: crmTasks.dueAt, owner: users.name })
      .from(crmTasks).leftJoin(users, eq(users.id, crmTasks.assignedUserId))
      .where(and(eq(crmTasks.organizationId, organization.id), eq(crmTasks.leadId, id), isNull(crmTasks.completedAt))).orderBy(asc(crmTasks.dueAt)),
    db.select({ id: users.id, name: users.name }).from(organizationMembers).innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, organization.id)).orderBy(asc(users.name)),
  ]);
  const primaryOpportunity = opportunities[0];
  const [proposals, tags, customFields, customValues, insights, availableServices] = await Promise.all([
    primaryOpportunity ? db.select({ id: crmProposals.id, number: crmProposals.number, title: crmProposals.title, status: crmProposals.status, total: crmProposals.totalInCents, item: crmProposalItems.description }).from(crmProposals).leftJoin(crmProposalItems, eq(crmProposalItems.proposalId, crmProposals.id)).where(and(eq(crmProposals.organizationId, organization.id), eq(crmProposals.opportunityId, primaryOpportunity.id))).orderBy(desc(crmProposals.createdAt)) : [],
    db.select({ id: crmTags.id, name: crmTags.name, color: crmTags.color }).from(crmLeadTags).innerJoin(crmTags, eq(crmTags.id, crmLeadTags.tagId)).where(and(eq(crmLeadTags.organizationId, organization.id), eq(crmLeadTags.leadId, id))),
    db.select().from(crmCustomFields).where(and(eq(crmCustomFields.organizationId, organization.id), eq(crmCustomFields.isActive, true))).orderBy(asc(crmCustomFields.name)),
    db.select({ fieldId: crmCustomFieldValues.fieldId, value: crmCustomFieldValues.value }).from(crmCustomFieldValues).where(and(eq(crmCustomFieldValues.organizationId, organization.id), eq(crmCustomFieldValues.leadId, id))),
    db.select().from(crmAiInsights).where(and(eq(crmAiInsights.organizationId, organization.id), eq(crmAiInsights.leadId, id))).orderBy(desc(crmAiInsights.createdAt)).limit(5),
    db.select({ id: services.id, name: services.name, price: services.priceInCents }).from(services).where(and(eq(services.organizationId, organization.id), eq(services.isActive, true))).orderBy(asc(services.name)),
  ]);

  return <div className="page-wrap">
    <Link className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-brand" href="/crm"><ArrowLeft className="size-4" /> Voltar ao funil</Link>
    <PageHeader eyebrow={`Lead · ${lead.source}`} title={lead.name} description={[lead.company, formatPhone(lead.phone), lead.email].filter(Boolean).join(" · ") || "Sem contato informado"} />
    <section className="grid gap-5 lg:grid-cols-[1fr_.8fr]">
      <article className="panel">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-widest text-brand">Dados comerciais</p><h2 className="mt-2 text-xl font-extrabold">{primaryOpportunity?.title ?? "Sem oportunidade"}</h2></div><span className="status-pill">{lead.status}</span></div>
        <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div><p className="text-muted">Responsável</p><p className="font-bold">{lead.owner ?? "Não atribuído"}</p></div>
          <div><p className="text-muted">Criado em</p><p className="font-bold">{lead.createdAt.toLocaleDateString("pt-BR")}</p></div>
          <div><p className="text-muted">Etapa atual</p><p className="font-bold">{primaryOpportunity?.stage ?? "—"}</p></div>
          <div><p className="text-muted">Valor estimado</p><p className="font-bold">{primaryOpportunity?.valueInCents == null ? "Não informado" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(primaryOpportunity.valueInCents / 100)}</p></div>
        </div>
        {lead.notes && <p className="mt-5 whitespace-pre-wrap rounded-xl bg-[#f3f5f1] p-4 text-sm leading-6">{lead.notes}</p>}
        {!lead.clientId ? <ActionForm action={convertCrmLeadToClient} successMessage="Lead convertido em cliente." className="mt-5"><input type="hidden" name="leadId" value={lead.id} /><button className="primary-button"><UserCheck className="mr-2 inline size-4" /> Converter em cliente</button></ActionForm> : <Link className="primary-button mt-5 inline-flex" href={`/clientes/${lead.clientId}`}>Abrir cadastro do cliente</Link>}
      </article>

      <aside className="panel">
        <h2 className="text-xl font-extrabold">Agendar próxima ação</h2>
        <ActionForm action={createCrmTask} successMessage="Atividade agendada." className="mt-4 grid gap-3">
          <input type="hidden" name="leadId" value={lead.id} /><input type="hidden" name="opportunityId" value={primaryOpportunity?.id ?? ""} />
          <input className="field" name="title" required placeholder="Ex.: Retornar com proposta" />
          <div className="grid gap-3 sm:grid-cols-2"><select className="field" name="type" defaultValue="follow_up"><option value="follow_up">Retorno</option><option value="call">Ligação</option><option value="message">Mensagem</option><option value="meeting">Reunião</option><option value="proposal">Proposta</option><option value="other">Outro</option></select><select className="field" name="assignedUserId" defaultValue={lead.assignedUserId ?? members[0]?.id}>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></div>
          <input className="field" name="dueAt" type="datetime-local" required />
          <textarea className="field min-h-20" name="notes" placeholder="Orientações para o responsável" />
          <button className="primary-button">Agendar atividade</button>
        </ActionForm>
      </aside>
    </section>
    <section className="panel mt-5"><h2 className="text-xl font-extrabold">Atividades pendentes</h2><div className="mt-4 divide-y">{tasks.map((task) => <article className="flex gap-3 py-4" key={task.id}><Clock3 className={`mt-1 size-4 shrink-0 ${task.dueAt < new Date() ? "text-red-700" : "text-brand"}`} /><div className="min-w-0 flex-1"><p className="font-bold">{task.title}</p><p className="text-xs text-muted">{task.type} · {task.owner ?? "Sem responsável"} · {task.dueAt.toLocaleString("pt-BR")}</p>{task.notes && <p className="mt-2 text-sm">{task.notes}</p>}</div><ActionForm action={completeCrmTask} successMessage="Atividade concluída."><input type="hidden" name="taskId" value={task.id} /><button className="icon-button" aria-label="Concluir"><CheckCircle2 className="size-4" /></button></ActionForm></article>)}{!tasks.length && <p className="empty-state">Nenhuma atividade pendente.</p>}</div></section>
    <section className="mt-5 grid gap-5 lg:grid-cols-2">
      <article className="panel"><h2 className="text-xl font-extrabold">Proposta comercial</h2>{primaryOpportunity ? <ActionForm action={createCrmProposal} successMessage="Proposta criada como rascunho." className="mt-4 grid gap-3"><input type="hidden" name="opportunityId" value={primaryOpportunity.id} /><input className="field" name="title" placeholder="Título da proposta" /><select className="field" name="serviceId" defaultValue=""><option value="">Item personalizado</option>{availableServices.map((service) => <option key={service.id} value={service.id}>{service.name}{service.price == null ? "" : ` · R$ ${(service.price / 100).toFixed(2)}`}</option>)}</select><input className="field" name="description" required placeholder="Serviço ou pacote oferecido" /><div className="grid grid-cols-2 gap-3"><input className="field" name="quantity" type="number" min="1" defaultValue="1" /><input className="field" name="unitPrice" inputMode="decimal" required placeholder="Valor unitário (R$)" /></div><input className="field" name="discount" inputMode="decimal" placeholder="Desconto (R$)" /><input className="field" name="validUntil" type="date" /><textarea className="field" name="notes" placeholder="Condições e observações" /><button className="primary-button">Criar rascunho</button></ActionForm> : <p className="empty-state">Crie uma oportunidade antes da proposta.</p>}<div className="mt-4 divide-y">{proposals.map((proposal) => <p className="py-3 text-sm" key={proposal.id}><strong>{proposal.number}</strong> · {proposal.item} · {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(proposal.total / 100)} · {proposal.status}</p>)}</div></article>
      <article className="panel"><h2 className="text-xl font-extrabold">Segmentação</h2><div className="mt-3 flex flex-wrap gap-2">{tags.map((tag) => <span className="rounded-full px-3 py-1 text-xs font-bold text-white" style={{ backgroundColor: tag.color }} key={tag.id}>{tag.name}</span>)}</div><ActionForm action={addCrmTag} successMessage="Etiqueta adicionada." className="mt-4 flex gap-2"><input type="hidden" name="leadId" value={lead.id} /><input className="field flex-1" name="name" required placeholder="Nova etiqueta" /><input className="h-11 w-14 rounded border p-1" name="color" type="color" defaultValue="#37664f" /><button className="secondary-button">Adicionar</button></ActionForm>
      <div className="mt-6 grid gap-3">{customFields.map((field) => { const current = customValues.find((item) => item.fieldId === field.id)?.value ?? ""; return <ActionForm action={setCrmCustomFieldValue} successMessage="Campo atualizado." className="grid grid-cols-[1fr_auto] gap-2" key={field.id}><input type="hidden" name="leadId" value={lead.id} /><input type="hidden" name="fieldId" value={field.id} /><label className="grid gap-1 text-xs font-bold text-muted">{field.name}<input className="field" name="value" type={field.fieldType === "date" ? "date" : field.fieldType === "number" ? "number" : "text"} defaultValue={current} /></label><button className="secondary-button self-end">Salvar</button></ActionForm>; })}</div></article>
    </section>
    <section className="panel mt-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-extrabold">Análise assistida por IA</h2><p className="text-sm text-muted">A IA gera um rascunho. Uma pessoa deve revisar antes de usar a resposta ou ação sugerida.</p></div><ActionForm action={generateCrmAiInsight} successMessage="Análise criada para revisão."><input type="hidden" name="leadId" value={lead.id} /><button className="primary-button">Gerar análise</button></ActionForm></div><div className="mt-4 grid gap-4">{insights.map((insight) => <article className="rounded-xl border p-4" key={insight.id}><div className="flex justify-between gap-3"><p className="font-extrabold">{insight.intent || "Análise comercial"}</p><span className="status-pill">{insight.status}</span></div><p className="mt-2 text-sm leading-6">{insight.summary}</p>{insight.suggestedAction && <p className="mt-3 text-sm"><strong>Próxima ação:</strong> {insight.suggestedAction}</p>}{insight.suggestedReply && <div className="mt-3 rounded-lg bg-[#f3f5f1] p-3 text-sm"><strong>Resposta sugerida:</strong><p className="mt-1 whitespace-pre-wrap">{insight.suggestedReply}</p></div>}{insight.status === "draft" && <div className="mt-3 flex gap-2"><ActionForm action={reviewCrmAiInsight} successMessage="Sugestão aprovada."><input type="hidden" name="insightId" value={insight.id} /><input type="hidden" name="status" value="approved" /><button className="secondary-button">Aprovar</button></ActionForm><ActionForm action={reviewCrmAiInsight} successMessage="Sugestão descartada."><input type="hidden" name="insightId" value={insight.id} /><input type="hidden" name="status" value="dismissed" /><button className="secondary-button">Descartar</button></ActionForm></div>}</article>)}</div></section>
  </div>;
}
