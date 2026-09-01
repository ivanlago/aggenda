import "dotenv/config";

import { and, eq } from "drizzle-orm";

import { db } from "../src/db";
import { chatConversations } from "../src/db/schema";

async function main() {
  const conversationId = process.argv[2];
  if (!conversationId) throw new Error("Informe o ID da conversa.");
  const [updated] = await db.update(chatConversations).set({
    handoffStatus: "bot",
    handoffReason: null,
    automationPaused: false,
    handoffResolvedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(chatConversations.id, conversationId),
    eq(chatConversations.handoffStatus, "requested"),
  )).returning({ id: chatConversations.id, handoffStatus: chatConversations.handoffStatus, automationPaused: chatConversations.automationPaused });
  console.log(JSON.stringify({ updated: updated ?? null }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
