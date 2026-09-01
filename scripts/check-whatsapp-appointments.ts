import "dotenv/config";

import { asc, eq, inArray } from "drizzle-orm";

import { db } from "../src/db";
import { appointments, auditLogs, chatConversations, professionals, services } from "../src/db/schema";

async function main() {
  const conversationId = process.argv[2];
  if (!conversationId) throw new Error("Informe o ID da conversa.");

  const [conversation] = await db.select({ clientId: chatConversations.clientId }).from(chatConversations).where(eq(chatConversations.id, conversationId)).limit(1);
  if (!conversation?.clientId) throw new Error("Conversa sem cliente associado.");

  const rows = await db.select({
    id: appointments.id,
    startsAt: appointments.startsAt,
    status: appointments.status,
    source: appointments.source,
    metadata: appointments.metadata,
    createdAt: appointments.createdAt,
    updatedAt: appointments.updatedAt,
    service: services.name,
    professional: professionals.name,
  }).from(appointments)
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .leftJoin(professionals, eq(professionals.id, appointments.professionalId))
    .where(eq(appointments.clientId, conversation.clientId))
    .orderBy(asc(appointments.startsAt));

  const audits = rows.length ? await db.select({
    entityId: auditLogs.entityId,
    action: auditLogs.action,
    details: auditLogs.details,
    createdAt: auditLogs.createdAt,
  }).from(auditLogs).where(inArray(auditLogs.entityId, rows.map((row) => row.id))).orderBy(asc(auditLogs.createdAt)) : [];

  console.log(JSON.stringify({ appointments: rows, audits }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
