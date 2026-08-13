import { desc, eq } from "drizzle-orm";
import { Bot, MessageCircle, UserRoundCheck } from "lucide-react";
import Link from "next/link";

import { createCrmLeadFromConversation, updateCrmHandoff } from "@/actions/crm";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { chatConversations, crmLeads, organizationMembers, users } from "@/db/schema";
import { requireOrganization } from "@/lib/session";

export default async function CrmInboxPage() {
  const { organization } = await requireOrganization();
  const [conversations, members] = await Promise.all([
    db.select({ id: chatConversations.id, contactName: chatConversations.contactName, phone: chatConversations.externalContactId, lastMessageAt: chatConversations.lastMessageAt, handoffStatus: chatConversations.handoffStatus, automationPaused: chatConversations.automationPaused, leadId: chatConversations.leadId, leadName: crmLeads.name, assignedUserId: chatConversations.assignedUserId, owner: users.name })
      .from(chatConversations).leftJoin(crmLeads, eq(crmLeads.id, chatConversations.leadId)).leftJoin(users, eq(users.id, chatConversations.assignedUserId))
      .where(eq(chatConversations.organizationId, organization.id)).orderBy(desc(chatConversations.lastMessageAt)),
    db.select({ id: users.id, name: users.name }).from(organizationMembers).innerJoin(users, eq(users.id, organizationMembers.userId)).where(eq(organizationMembers.organizationId, organization.id)),
  ]);
  return <div className="page-wrap">
    <Link className="mb-4 inline-flex text-sm font-bold text-brand" href="/crm">← Voltar ao funil</Link>
    <PageHeader eyebrow={organization.name} title="Conversas comerciais" description="Conecte atendimentos do WhatsApp ao funil e controle a passagem entre IA e equipe." />
    <div className="grid gap-4">
      {conversations.map((conversation) => <article className="panel" key={conversation.id}>
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><MessageCircle className="mt-1 size-5 text-brand" /><div><h2 className="font-extrabold">{conversation.contactName || conversation.phone}</h2><p className="text-sm text-muted">{conversation.phone} · última mensagem {conversation.lastMessageAt.toLocaleString("pt-BR")}</p><p className="mt-1 text-xs font-bold">{conversation.owner ?? "Sem responsável"}</p></div></div><span className="status-pill">{conversation.automationPaused ? "IA pausada" : "IA ativa"}</span></div>
        <div className="mt-4 flex flex-wrap gap-2">
          {conversation.leadId ? <Link className="secondary-button" href={`/crm/leads/${conversation.leadId}`}>Abrir {conversation.leadName}</Link> : <ActionForm action={createCrmLeadFromConversation} successMessage="Conversa adicionada ao CRM."><input type="hidden" name="conversationId" value={conversation.id} /><button className="primary-button">Criar lead no funil</button></ActionForm>}
          <ActionForm action={updateCrmHandoff} successMessage="Atendimento assumido pela equipe." className="flex flex-wrap gap-2"><input type="hidden" name="conversationId" value={conversation.id} /><input type="hidden" name="status" value="human" /><select className="field py-2" name="assignedUserId" defaultValue={conversation.assignedUserId ?? members[0]?.id}>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><input className="field py-2" name="reason" placeholder="Motivo do handoff" /><button className="secondary-button"><UserRoundCheck className="mr-2 inline size-4" />Assumir</button></ActionForm>
          {conversation.automationPaused && <ActionForm action={updateCrmHandoff} successMessage="Atendimento devolvido à automação."><input type="hidden" name="conversationId" value={conversation.id} /><input type="hidden" name="status" value="bot" /><button className="secondary-button"><Bot className="mr-2 inline size-4" />Devolver à IA</button></ActionForm>}
        </div>
      </article>)}
      {!conversations.length && <div className="panel empty-state">Nenhuma conversa recebida pelo WhatsApp.</div>}
    </div>
  </div>;
}
