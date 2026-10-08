import { and, desc, eq, exists, gte, ilike, isNull, lt, ne, or } from "drizzle-orm";
import { Bot, MessageCircle, UserRoundCheck } from "lucide-react";
import Link from "next/link";

import { createCrmLeadFromConversation, updateCrmHandoff } from "@/actions/crm";
import { ActionForm } from "@/components/action-form";
import { db } from "@/db";
import { chatConversations, chatMessages, clients, crmLeads, organizationMembers, users } from "@/db/schema";
import { zonedDate } from "@/lib/availability";
import { formatPhone } from "@/lib/phone";

export type ConversationFilters = {
  conversationFrom?: string; conversationTo?: string; conversationSearch?: string;
  conversationClient?: string; conversationStatus?: string; conversationOwner?: string; conversationPage?: string;
};

function validDate(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
}

const statuses: Record<string, string> = { open: "Em aberto", bot: "Com a IA", requested: "Aguardando equipe", human: "Com a equipe", resolved: "Resolvida" };
const pageSize = 50;

export async function CommercialConversationsPanel({ organizationId, timezone, canManage, canCreateLead, filters }: { organizationId: string; timezone: string; canManage: boolean; canCreateLead: boolean; filters: ConversationFilters }) {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const from = validDate(filters.conversationFrom) ? filters.conversationFrom! : today;
  const to = validDate(filters.conversationTo) ? filters.conversationTo! : from;
  const invalid = to < from || Boolean(filters.conversationFrom && !validDate(filters.conversationFrom)) || Boolean(filters.conversationTo && !validDate(filters.conversationTo));
  const nextDay = new Date(`${to}T00:00:00Z`); nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const start = zonedDate(from, "00:00", timezone);
  const end = zonedDate(nextDay.toISOString().slice(0, 10), "00:00", timezone);
  const search = (filters.conversationSearch ?? "").trim().slice(0, 120);
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const phoneDigits = /^[+\d\s().-]+$/.test(search) ? search.replace(/\D/g, "") : "";
  const status = Object.hasOwn(statuses, filters.conversationStatus ?? "") ? filters.conversationStatus! : "";
  const client = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filters.conversationClient ?? "") ? filters.conversationClient! : "";
  const owner = filters.conversationOwner ?? "";
  const pageNumber = Number(filters.conversationPage);
  const page = Number.isFinite(pageNumber) ? Math.min(10000, Math.max(1, Math.floor(pageNumber))) : 1;
  const [rows, members, customerRows] = await Promise.all([
    invalid ? Promise.resolve([]) : db.select({ id: chatConversations.id, contactName: chatConversations.contactName, phone: chatConversations.externalContactId, lastMessageAt: chatConversations.lastMessageAt, handoffStatus: chatConversations.handoffStatus, automationPaused: chatConversations.automationPaused, leadId: chatConversations.leadId, leadName: crmLeads.name, clientName: clients.name, assignedUserId: chatConversations.assignedUserId, owner: users.name })
      .from(chatConversations)
      .leftJoin(crmLeads, and(eq(crmLeads.id, chatConversations.leadId), eq(crmLeads.organizationId, organizationId)))
      .leftJoin(clients, and(eq(clients.id, chatConversations.clientId), eq(clients.organizationId, organizationId)))
      .leftJoin(users, eq(users.id, chatConversations.assignedUserId))
      .where(and(eq(chatConversations.organizationId, organizationId),
        or(and(gte(chatConversations.lastMessageAt, start), lt(chatConversations.lastMessageAt, end)), exists(db.select({ id: chatMessages.id }).from(chatMessages).where(and(eq(chatMessages.organizationId, organizationId), eq(chatMessages.conversationId, chatConversations.id), gte(chatMessages.occurredAt, start), lt(chatMessages.occurredAt, end))))),
        search ? or(ilike(chatConversations.contactName, pattern), ilike(crmLeads.name, pattern), ilike(clients.name, pattern), ilike(chatConversations.externalContactId, phoneDigits ? `%${phoneDigits}%` : pattern)) : undefined,
        client ? eq(chatConversations.clientId, client) : undefined,
        status === "open" ? ne(chatConversations.handoffStatus, "resolved") : status ? eq(chatConversations.handoffStatus, status) : undefined,
        owner === "unassigned" ? isNull(chatConversations.assignedUserId) : owner ? eq(chatConversations.assignedUserId, owner) : undefined,
      )).orderBy(desc(chatConversations.lastMessageAt), desc(chatConversations.id)).limit(pageSize + 1).offset((page - 1) * pageSize),
    db.select({ id: users.id, name: users.name }).from(organizationMembers).innerJoin(users, eq(users.id, organizationMembers.userId)).where(eq(organizationMembers.organizationId, organizationId)).orderBy(users.name),
    db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.organizationId, organizationId)).orderBy(clients.name),
  ]);
  function pageLink(number: number) {
    const params = new URLSearchParams({ tab: "conversas", conversationFrom: from, conversationTo: to, conversationPage: String(number) });
    if (search) params.set("conversationSearch", search);
    if (client) params.set("conversationClient", client);
    if (status) params.set("conversationStatus", status);
    if (owner) params.set("conversationOwner", owner);
    return `/crescimento?${params}`;
  }
  return <section className="mt-5 grid gap-4">
    <div className="panel"><h2 className="text-lg font-extrabold">Conversas comerciais</h2><p className="mt-1 text-sm text-muted">Contatos com mensagens no período selecionado. Por padrão, mostramos os contatos de hoje no horário da clínica.</p>
      <form action="/crescimento" method="get" className="mt-5 grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <input type="hidden" name="tab" value="conversas" />
        <label className="grid gap-2 text-sm font-bold">De<input className="field" name="conversationFrom" type="date" defaultValue={from} required /></label>
        <label className="grid gap-2 text-sm font-bold">Até<input className="field" name="conversationTo" type="date" defaultValue={to} required /></label>
        <label className="grid gap-2 text-sm font-bold">Nome ou telefone<input className="field" name="conversationSearch" defaultValue={search} placeholder="Cliente, contato ou lead" maxLength={120} /></label>
        <label className="grid gap-2 text-sm font-bold">Cliente<select className="field" name="conversationClient" defaultValue={client}><option value="">Todos os clientes e contatos</option>{customerRows.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-bold">Situação<select className="field" name="conversationStatus" defaultValue={status}><option value="">Todas as situações</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-bold">Responsável<select className="field" name="conversationOwner" defaultValue={owner}><option value="">Todos os responsáveis</option><option value="unassigned">Sem responsável</option>{members.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-3"><button className="primary-button">Buscar conversas</button><Link className="secondary-button" href="/crescimento?tab=conversas">Contatos de hoje / Limpar filtros</Link></div>
      </form>
      {invalid && <p role="alert" className="mt-4 text-sm font-bold text-red-700">Informe datas válidas, com a data final igual ou posterior à inicial.</p>}
      {!invalid && <p className="mt-4 text-xs text-muted">{rows.slice(0, pageSize).length} conversa(s) nesta página · {new Date(`${from}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })} a {new Date(`${to}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</p>}
    </div>
    {rows.slice(0, pageSize).map((conversation) => <article className="panel" key={conversation.id}>
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><MessageCircle className="mt-1 size-5 text-brand" /><div><h3 className="font-extrabold">{conversation.clientName || conversation.contactName || conversation.leadName || formatPhone(conversation.phone)}</h3><p className="text-sm text-muted">{formatPhone(conversation.phone)} · última mensagem {conversation.lastMessageAt.toLocaleString("pt-BR", { timeZone: timezone })}</p><p className="mt-1 text-xs font-bold">{conversation.owner ?? "Sem responsável"} · {statuses[conversation.handoffStatus] ?? conversation.handoffStatus}</p></div></div><span className="status-pill">{conversation.automationPaused ? "IA pausada" : "IA ativa"}</span></div>
      <div className="mt-4 flex flex-wrap gap-2">
        {conversation.leadId ? <Link className="secondary-button" href={`/crm/leads/${conversation.leadId}`}>Abrir {conversation.leadName}</Link> : canCreateLead && <ActionForm action={createCrmLeadFromConversation} successMessage="Conversa adicionada ao CRM."><input type="hidden" name="conversationId" value={conversation.id} /><button className="primary-button">Criar lead no funil</button></ActionForm>}
        {canManage && <ActionForm action={updateCrmHandoff} successMessage="Atendimento assumido pela equipe." className="flex flex-wrap gap-2"><input type="hidden" name="conversationId" value={conversation.id} /><input type="hidden" name="status" value="human" /><select className="field py-2" name="assignedUserId" aria-label="Responsável pelo atendimento" defaultValue={conversation.assignedUserId ?? members[0]?.id}>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><input className="field py-2" name="reason" aria-label="Motivo da transferência" placeholder="Motivo da transferência" /><button className="secondary-button"><UserRoundCheck className="mr-2 inline size-4" />Assumir</button></ActionForm>}
        {canManage && conversation.automationPaused && <ActionForm action={updateCrmHandoff} successMessage="Atendimento devolvido à automação."><input type="hidden" name="conversationId" value={conversation.id} /><input type="hidden" name="status" value="bot" /><button className="secondary-button"><Bot className="mr-2 inline size-4" />Devolver à IA</button></ActionForm>}
      </div>
    </article>)}
    {!invalid && !rows.length && <div className="panel empty-state">Nenhuma conversa encontrada neste período com os filtros selecionados.</div>}
    {(page > 1 || rows.length > pageSize) && <nav className="flex items-center justify-between gap-3" aria-label="Páginas de conversas">{page > 1 ? <Link className="secondary-button" href={pageLink(page - 1)}>Anterior</Link> : <span />}<span className="text-sm text-muted">Página {page}</span>{rows.length > pageSize ? <Link className="secondary-button" href={pageLink(page + 1)}>Próxima</Link> : <span />}</nav>}
  </section>;
}
