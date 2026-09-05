import "dotenv/config";

import { desc, eq, ilike } from "drizzle-orm";

import { db } from "../src/db";
import { appointments, clients, outboxEvents, professionals, services } from "../src/db/schema";

async function main() {
  const search = process.argv.slice(2).join(" ").trim() || "%";
  const rows = await db
    .select({
      id: appointments.id,
      createdAt: appointments.createdAt,
      startsAt: appointments.startsAt,
      status: appointments.status,
      client: clients.name,
      phone: clients.phone,
      service: services.name,
      professional: professionals.name,
    })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .leftJoin(professionals, eq(professionals.id, appointments.professionalId))
    .where(ilike(clients.name, `%${search}%`))
    .orderBy(desc(appointments.createdAt))
    .limit(5);

  for (const appointment of rows) {
    const events = await db
      .select({
        id: outboxEvents.id,
        type: outboxEvents.eventType,
        status: outboxEvents.status,
        attempts: outboxEvents.attempts,
        lastError: outboxEvents.lastError,
        availableAt: outboxEvents.availableAt,
        createdAt: outboxEvents.createdAt,
        processedAt: outboxEvents.processedAt,
        payload: outboxEvents.payload,
      })
      .from(outboxEvents)
      .where(eq(outboxEvents.aggregateId, appointment.id))
      .orderBy(desc(outboxEvents.createdAt));
    console.log(JSON.stringify({ appointment, events }, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
