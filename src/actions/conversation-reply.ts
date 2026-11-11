"use server";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, chatConversations, chatMessages, outboxEvents, whatsappChannels } from "@/db/schema";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";
import { triggerOutboxWorker } from "@/lib/outbox-trigger";

export async function replyToConversation(data: FormData) {
  const {session,organization}=await requireOrganization();
  assertOrganizationPermission(organization.role,"chat.inbox");
  const input=z.object({conversationId:z.uuid(),requestId:z.uuid(),body:z.string().trim().min(1,"Escreva uma mensagem.").max(4096,"Limite de 4.096 caracteres.")}).parse(Object.fromEntries(data));
  await db.transaction(async tx=>{
    const [conversation]=await tx.select().from(chatConversations).where(and(eq(chatConversations.id,input.conversationId),eq(chatConversations.organizationId,organization.id))).for("update");
    if(!conversation)throw new Error("Conversa não encontrada.");
    if(conversation.handoffStatus!=="human" || !conversation.automationPaused || conversation.assignedUserId!==session.user.id)throw new Error("Assuma o atendimento para responder a esta conversa.");
    const externalId=`human:${organization.id}:${input.requestId}`;
    const [previous]=await tx.select().from(chatMessages).where(eq(chatMessages.externalMessageId,externalId));
    if(previous){
      if(previous.organizationId!==organization.id || previous.conversationId!==conversation.id || previous.body!==input.body || previous.rawPayload?.actorUserId!==session.user.id)throw new Error("Solicitação de envio já utilizada. Atualize a conversa.");
      return;
    }
    const [inbound]=await tx.select({at:chatMessages.occurredAt}).from(chatMessages).where(and(eq(chatMessages.organizationId,organization.id),eq(chatMessages.conversationId,conversation.id),eq(chatMessages.direction,"inbound"))).orderBy(desc(chatMessages.occurredAt)).limit(1);
    if(!inbound || inbound.at.getTime()<=Date.now()-86400000)throw new Error("A janela de 24 horas do WhatsApp encerrou. Aguarde uma nova mensagem do cliente ou utilize um modelo aprovado.");
    const [channel]=await tx.select().from(whatsappChannels).where(and(eq(whatsappChannels.id,conversation.channelId),eq(whatsappChannels.organizationId,organization.id),eq(whatsappChannels.isActive,true)));
    if(!channel)throw new Error("O canal WhatsApp desta conversa está desconectado.");
    const now=new Date(),messageId=crypto.randomUUID();
    await tx.insert(chatMessages).values({id:messageId,organizationId:organization.id,conversationId:conversation.id,externalMessageId:externalId,direction:"outbound",status:"queued",messageType:"text",body:input.body,rawPayload:{actor:"human",actorUserId:session.user.id},occurredAt:now});
    await tx.insert(outboxEvents).values({organizationId:organization.id,eventKey:`whatsapp:human:${organization.id}:${input.requestId}`,eventType:"whatsapp.message.send",aggregateType:"chat_message",aggregateId:messageId,payload:{organizationId:organization.id,channelId:channel.id,phoneNumberId:channel.phoneNumberId,to:conversation.externalContactId,text:input.body}});
    await tx.update(chatConversations).set({lastMessageAt:now,updatedAt:now}).where(eq(chatConversations.id,conversation.id));
    await tx.insert(auditLogs).values({organizationId:organization.id,userId:session.user.id,action:"crm.conversation.reply_queued",entityType:"chat_conversation",entityId:conversation.id,details:{messageId}});
  });
  await triggerOutboxWorker();
  revalidatePath("/crescimento");revalidatePath("/crm/inbox");
}
