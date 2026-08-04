import { createHmac, timingSafeEqual } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import {
  chatConversations,
  chatMessages,
  outboxEvents,
  whatsappChannels,
} from "@/db/schema";

export const runtime = "nodejs";

type MetaMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
};

type MetaChangeValue = {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
  messages?: MetaMessage[];
};

type MetaWebhook = {
  object?: string;
  entry?: Array<{
    changes?: Array<{ field?: string; value?: MetaChangeValue }>;
  }>;
};

function validSignature(rawBody: string, signature: string | null) {
  const secret = process.env.META_WHATSAPP_APP_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;

  const expected = `sha256=${createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex")}`;
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  if (
    mode !== "subscribe" ||
    !challenge ||
    !process.env.META_WHATSAPP_VERIFY_TOKEN ||
    token !== process.env.META_WHATSAPP_VERIFY_TOKEN
  ) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(challenge, { status: 200 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!validSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let webhook: MetaWebhook;
  try {
    webhook = JSON.parse(rawBody) as MetaWebhook;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (webhook.object !== "whatsapp_business_account") {
    return NextResponse.json({ received: true, accepted: 0 });
  }

  let accepted = 0;

  for (const entry of webhook.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (change.field !== "messages" || !value || !phoneNumberId) continue;

      const [channel] = await db
        .select({
          id: whatsappChannels.id,
          organizationId: whatsappChannels.organizationId,
        })
        .from(whatsappChannels)
        .where(
          and(
            eq(whatsappChannels.phoneNumberId, phoneNumberId),
            eq(whatsappChannels.isActive, true)
          )
        )
        .limit(1);

      if (!channel) continue;

      for (const message of value.messages ?? []) {
        if (!message.id || !message.from) continue;

        const contact = value.contacts?.find(
          (candidate) => candidate.wa_id === message.from
        );
        const occurredAt = message.timestamp
          ? new Date(Number(message.timestamp) * 1000)
          : new Date();

        const inserted = await db.transaction(async (tx) => {
          const [conversation] = await tx
            .insert(chatConversations)
            .values({
              organizationId: channel.organizationId,
              channelId: channel.id,
              externalContactId: message.from!,
              contactName: contact?.profile?.name,
              lastMessageAt: occurredAt,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [
                chatConversations.channelId,
                chatConversations.externalContactId,
              ],
              set: {
                contactName: contact?.profile?.name,
                lastMessageAt: occurredAt,
                updatedAt: new Date(),
              },
            })
            .returning({ id: chatConversations.id });

          const [storedMessage] = await tx
            .insert(chatMessages)
            .values({
              organizationId: channel.organizationId,
              conversationId: conversation.id,
              externalMessageId: message.id!,
              direction: "inbound",
              status: "received",
              messageType: message.type ?? "unknown",
              body: message.text?.body,
              rawPayload: message as Record<string, unknown>,
              occurredAt,
            })
            .onConflictDoNothing({ target: chatMessages.externalMessageId })
            .returning({ id: chatMessages.id });

          if (!storedMessage) return false;

          await tx.insert(outboxEvents).values({
            organizationId: channel.organizationId,
            eventKey: `whatsapp:inbound:${message.id}`,
            eventType: "whatsapp.message.received",
            aggregateType: "chat_message",
            aggregateId: storedMessage.id,
            payload: {
              organizationId: channel.organizationId,
              channelId: channel.id,
              phoneNumberId,
              conversationId: conversation.id,
              messageId: storedMessage.id,
              externalMessageId: message.id,
              from: message.from,
              contactName: contact?.profile?.name,
              type: message.type ?? "unknown",
              text: message.text?.body,
              occurredAt: occurredAt.toISOString(),
              metaWebhook: webhook,
            },
          });

          return true;
        });

        if (inserted) accepted += 1;
      }
    }
  }

  return NextResponse.json({ received: true, accepted });
}
