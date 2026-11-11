import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { chatMessages, outboxEvents } from "@/db/schema";
import { ConversationReplyForm } from "@/components/conversation-reply-form";

export async function ConversationThread({organizationId,conversationId,timezone,canReply}:{organizationId:string;conversationId:string;timezone:string;canReply:boolean}){
  const messages=await db.select({id:chatMessages.id,body:chatMessages.body,direction:chatMessages.direction,status:chatMessages.status,type:chatMessages.messageType,at:chatMessages.occurredAt,payload:chatMessages.rawPayload,delivery:outboxEvents.status}).from(chatMessages).leftJoin(outboxEvents,and(eq(outboxEvents.organizationId,organizationId),eq(outboxEvents.aggregateType,"chat_message"),eq(outboxEvents.aggregateId,sql`${chatMessages.id}::text`),eq(outboxEvents.eventType,"whatsapp.message.send"))).where(and(eq(chatMessages.organizationId,organizationId),eq(chatMessages.conversationId,conversationId))).orderBy(desc(chatMessages.occurredAt),desc(chatMessages.id)).limit(50);
  const [lastInbound]=await db.select({expired:sql<boolean>`${chatMessages.occurredAt} <= now() - interval '24 hours'`}).from(chatMessages).where(and(eq(chatMessages.organizationId,organizationId),eq(chatMessages.conversationId,conversationId),eq(chatMessages.direction,"inbound"))).orderBy(desc(chatMessages.occurredAt)).limit(1);
  const expired=!lastInbound || lastInbound.expired;
  const labels:Record<string,string>={queued:"Na fila de envio",sent:"Enviada",delivered:"Entregue",read:"Lida",failed:"Falha no envio"};
  return <section className="mt-5 border-t pt-4" aria-label="Histórico e resposta da conversa">
    <h4 className="mb-3 font-bold">Conversa</h4>
    <ol className="flex max-h-80 flex-col-reverse gap-3 overflow-y-auto rounded-xl bg-slate-50 p-3" aria-label="Últimas mensagens" aria-live="polite">
      {messages.map(message=>{
        const status=message.delivery==="processed"?"sent":message.delivery==="failed"?"failed":message.status;
        return <li key={message.id} className={`max-w-[90%] rounded-xl border p-3 ${message.direction==="outbound"?"self-end bg-teal-50":"self-start bg-white"}`}>
          <p className="mb-1 text-xs font-bold">{message.direction==="inbound"?"Cliente":message.payload?.actor==="human"?"Equipe":"Assistente"}</p>
          <p className="whitespace-pre-wrap break-words text-sm">{message.body || `[Mensagem: ${message.type}]`}</p>
          <p className="mt-1 text-xs text-muted">{message.at.toLocaleString("pt-BR",{timeZone:timezone})}{message.direction==="outbound"&&` · ${labels[status]??status}`}</p>
        </li>;
      })}
      {!messages.length&&<li className="text-sm text-muted">Nenhuma mensagem registrada.</li>}
    </ol>
    <ConversationReplyForm key={conversationId} conversationId={conversationId} disabledReason={!canReply?"Somente o responsável pelo atendimento, com permissão de mensagens, pode responder. Assuma para si antes de enviar.":expired?"A janela de 24 horas do WhatsApp encerrou. Aguarde uma nova mensagem do cliente ou utilize um modelo aprovado.":undefined}/>
  </section>;
}
