import { and, desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { chatConversations, chatMessages, organizations, organizationUsageCounters, outboxEvents, services } from "@/db/schema";
import { generateAiJson } from "@/lib/ai/provider";
import { triggerOutboxWorker } from "@/lib/outbox-trigger";

export const runtime = "nodejs";

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  phoneNumberId: z.string().min(1),
  from: z.string().min(5),
  text: z.string().max(4000).default(""),
  whatsappServiceCode: z.enum(["menu", "chat", "chat_ai", "core_ai"]),
});

const answerSchema = z.object({
  action: z.enum(["reply", "handoff"]),
  reply: z.string().min(1).max(3500),
  intent: z.string().max(80).default("unknown"),
  confidence: z.number().min(0).max(1).default(0),
});

function authorized(request: NextRequest) {
  const expected = process.env.AGGENDA_INTERNAL_API_KEY;
  return Boolean(expected && request.headers.get("authorization") === `Bearer ${expected}`);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const input = inputSchema.parse(await request.json());
  const [conversation] = await db.select().from(chatConversations).where(and(
    eq(chatConversations.id, input.conversationId),
    eq(chatConversations.organizationId, input.organizationId),
  )).limit(1);
  if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  if (conversation.automationPaused || conversation.handoffStatus === "human") {
    return NextResponse.json({ accepted: true, skipped: "human_handoff" });
  }

  const [organization] = await db.select({ name: organizations.name, description: organizations.publicDescription }).from(organizations)
    .where(eq(organizations.id, input.organizationId)).limit(1);
  const catalog = await db.select({ name: services.name, description: services.description, durationMinutes: services.durationMinutes, priceInCents: services.priceInCents })
    .from(services).where(and(eq(services.organizationId, input.organizationId), eq(services.isActive, true))).limit(50);
  const history = await db.select({ direction: chatMessages.direction, body: chatMessages.body }).from(chatMessages)
    .where(and(eq(chatMessages.organizationId, input.organizationId), eq(chatMessages.conversationId, input.conversationId)))
    .orderBy(desc(chatMessages.occurredAt)).limit(12);

  const usesAi = input.whatsappServiceCode === "chat_ai" || input.whatsappServiceCode === "core_ai";
  const result = usesAi ? await generateAiJson({
    schema: answerSchema,
    messages: [
      { role: "system", content: "Você é o atendimento comercial do Aggenda para a empresa informada. Responda em português do Brasil, com objetividade e cordialidade. Use somente o contexto aprovado. Nunca invente preços, serviços, horários ou políticas. Não faça diagnóstico clínico. Não execute ações operacionais: quando a pessoa quiser agendar, cancelar, pagar ou falar com alguém, colete o necessário e encaminhe para atendimento humano. Responda somente JSON com action, reply, intent e confidence. Use action=handoff em pedido humano, ação operacional, risco ou confiança abaixo de 0.65." },
      { role: "user", content: JSON.stringify({ organization, catalog, recentMessages: history.reverse(), currentMessage: input.text }) },
    ],
  }) : {
    data: {
      action: "reply" as const,
      reply: `Olá! Você está falando com ${organization?.name ?? "nossa equipe"}. Como podemos ajudar?`,
      intent: "greeting",
      confidence: 1,
    },
    model: "aggenda-deterministic-v1",
  };

  const externalMessageId = `aggenda-ai:${input.messageId}`;
  const now = new Date();
  await db.transaction(async (tx) => {
    const [stored] = await tx.insert(chatMessages).values({
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      externalMessageId,
      direction: "outbound",
      status: "queued",
      messageType: "text",
      body: result.data.reply,
      rawPayload: { source: "aggenda_ai", model: result.model, intent: result.data.intent, confidence: result.data.confidence },
      occurredAt: now,
    }).onConflictDoNothing({ target: chatMessages.externalMessageId }).returning({ id: chatMessages.id });
    if (!stored) return;
    await tx.insert(outboxEvents).values({
      organizationId: input.organizationId,
      eventKey: `whatsapp:ai-reply:${input.messageId}`,
      eventType: "whatsapp.message.send",
      aggregateType: "chat_message",
      aggregateId: stored.id,
      payload: { organizationId: input.organizationId, channelId: conversation.channelId, conversationId: input.conversationId, messageId: stored.id, phoneNumberId: input.phoneNumberId, to: input.from, text: result.data.reply },
    }).onConflictDoNothing({ target: outboxEvents.eventKey });
    await tx.update(chatConversations).set({
      handoffStatus: result.data.action === "handoff" ? "requested" : conversation.handoffStatus,
      handoffReason: result.data.action === "handoff" ? `IA: ${result.data.intent}` : conversation.handoffReason,
      automationPaused: result.data.action === "handoff",
      handoffRequestedAt: result.data.action === "handoff" ? now : conversation.handoffRequestedAt,
      updatedAt: now,
    }).where(eq(chatConversations.id, input.conversationId));
    if (usesAi) {
      const periodStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
      await tx.insert(organizationUsageCounters).values({ organizationId: input.organizationId, periodStart, metric: "ai.calls", quantity: 1 })
        .onConflictDoUpdate({ target: [organizationUsageCounters.organizationId, organizationUsageCounters.periodStart, organizationUsageCounters.metric], set: { quantity: sql`${organizationUsageCounters.quantity} + 1`, updatedAt: now } });
    }
  });
  await triggerOutboxWorker();
  return NextResponse.json({ accepted: true, action: result.data.action, model: result.model });
}
