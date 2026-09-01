import "dotenv/config";

import { desc, eq, inArray } from "drizzle-orm";

import { db } from "../src/db";
import { chatConversations, chatMessages, outboxEvents } from "../src/db/schema";

async function main() {
const inbound = await db.select({
  id: chatMessages.id,
  conversationId: chatMessages.conversationId,
  externalMessageId: chatMessages.externalMessageId,
  body: chatMessages.body,
  occurredAt: chatMessages.occurredAt,
}).from(chatMessages).where(eq(chatMessages.direction, "inbound")).orderBy(desc(chatMessages.occurredAt)).limit(5);

const events = inbound.length ? await db.select({
  id: outboxEvents.id,
  aggregateId: outboxEvents.aggregateId,
  status: outboxEvents.status,
  attempts: outboxEvents.attempts,
  lastError: outboxEvents.lastError,
  createdAt: outboxEvents.createdAt,
  processedAt: outboxEvents.processedAt,
  payload: outboxEvents.payload,
}).from(outboxEvents).where(inArray(outboxEvents.aggregateId, inbound.map((item) => item.id))).orderBy(desc(outboxEvents.createdAt)) : [];

const outbound = inbound.length ? await db.select({
  conversationId: chatMessages.conversationId,
  status: chatMessages.status,
  body: chatMessages.body,
  occurredAt: chatMessages.occurredAt,
}).from(chatMessages).where(inArray(chatMessages.conversationId, inbound.map((item) => item.conversationId))).orderBy(desc(chatMessages.occurredAt)).limit(10) : [];

const conversations = inbound.length ? await db.select({
  id: chatConversations.id,
  handoffStatus: chatConversations.handoffStatus,
  automationPaused: chatConversations.automationPaused,
  handoffReason: chatConversations.handoffReason,
  handoffRequestedAt: chatConversations.handoffRequestedAt,
  handoffResolvedAt: chatConversations.handoffResolvedAt,
  updatedAt: chatConversations.updatedAt,
}).from(chatConversations).where(inArray(chatConversations.id, inbound.map((item) => item.conversationId))) : [];

console.log(JSON.stringify({
  inbound: inbound.map((item) => ({ ...item, body: item.body?.slice(0, 120) })),
  events: events.map((event) => ({
    ...event,
    payload: {
      workflowProduct: event.payload.workflowProduct,
      whatsappServiceCode: event.payload.whatsappServiceCode,
      conversationId: event.payload.conversationId,
      messageId: event.payload.messageId,
    },
  })),
  outbound,
  conversations,
}, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
