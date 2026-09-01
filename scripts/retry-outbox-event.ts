import "dotenv/config";

import { and, eq } from "drizzle-orm";

import { db } from "../src/db";
import { outboxEvents } from "../src/db/schema";
import { triggerOutboxWorker } from "../src/lib/outbox-trigger";

async function main() {
  const eventId = process.argv[2];

  if (!eventId || !/^[0-9a-f-]{36}$/i.test(eventId)) {
    throw new Error("Informe o UUID exato do evento.");
  }

  const [event] = await db
  .update(outboxEvents)
  .set({
    status: "pending",
    attempts: 0,
    availableAt: new Date(),
    lockedAt: null,
    lockedBy: null,
    processedAt: null,
    lastError: null,
    updatedAt: new Date(),
  })
  .where(
    and(
      eq(outboxEvents.id, eventId),
      eq(outboxEvents.eventType, "whatsapp.message.received"),
    ),
  )
  .returning({ id: outboxEvents.id, status: outboxEvents.status });

  if (!event) throw new Error("Evento de entrada do WhatsApp não encontrado.");

  await triggerOutboxWorker();
  console.log(JSON.stringify({ retried: event }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
