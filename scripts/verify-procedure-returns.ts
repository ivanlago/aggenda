import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { and, eq } from "drizzle-orm";

loadEnvConfig(process.cwd());

async function main() {
  const { db } = await import("../src/db");
  const { appointments, clients, organizations, procedureReturns, retailSaleItems, retailSales, services } = await import("../src/db/schema");
  const { updateAppointmentAndInventory } = await import("../src/lib/inventory");
  const { getProcedureReturns } = await import("../src/lib/procedure-returns");
  const rollback = new Error("TEST_ROLLBACK");
  let assertions = 0;
  try {
    await db.transaction(async (tx) => {
      const database = tx as unknown as typeof db;
      const [organization] = await tx.insert(organizations).values({ name: "Teste temporário de retornos", slug: `test-returns-${crypto.randomUUID()}`, timezone: "America/Bahia" }).returning();
      const [client] = await tx.insert(clients).values({ organizationId: organization.id, name: "Cliente de teste" }).returning();
      const [service] = await tx.insert(services).values({ organizationId: organization.id, name: "Procedimento de teste", durationMinutes: 30, priceInCents: 0, returnInterval: 1, returnIntervalUnit: "months", returnReminderDays: 7 }).returning();
      const [appointment] = await tx.insert(appointments).values({ organizationId: organization.id, clientId: client.id, serviceId: service.id, startsAt: new Date("2026-08-31T15:00:00Z"), endsAt: new Date("2026-08-31T15:30:00Z"), priceInCents: 0 }).returning();
      const input = { organizationId: organization.id, appointmentId: appointment.id, status: "completed" as const, cancellationReason: null, userId: crypto.randomUUID() };
      await updateAppointmentAndInventory(input, database);
      let records = await tx.select().from(procedureReturns).where(eq(procedureReturns.appointmentId, appointment.id));
      assert.equal(records.length, 1); assert.equal(records[0].dueDate, "2026-09-30"); assertions += 2;
      await updateAppointmentAndInventory(input, database);
      records = await tx.select().from(procedureReturns).where(eq(procedureReturns.appointmentId, appointment.id));
      assert.equal(records.length, 1); assertions++;
      await tx.update(services).set({ returnInterval: 12 }).where(eq(services.id, service.id));
      let list = await getProcedureReturns(organization.id, organization.timezone, client.id, new Date("2026-10-01T12:00:00Z"), database);
      assert.equal(list[0].dueDate, "2026-09-30"); assert.equal(list[0].state, "overdue"); assertions += 2;
      const [next] = await tx.insert(appointments).values({ organizationId: organization.id, clientId: client.id, serviceId: service.id, startsAt: new Date("2026-10-10T15:00:00Z"), endsAt: new Date("2026-10-10T15:30:00Z"), priceInCents: 0 }).returning();
      list = await getProcedureReturns(organization.id, organization.timezone, client.id, new Date("2026-10-01T12:00:00Z"), database);
      assert.equal(list[0].state, "scheduled"); assertions++;
      await tx.update(appointments).set({ status: "cancelled" }).where(eq(appointments.id, next.id));
      list = await getProcedureReturns(organization.id, organization.timezone, client.id, new Date("2026-10-01T12:00:00Z"), database);
      assert.equal(list[0].state, "overdue"); assertions++;
      await updateAppointmentAndInventory({ ...input, returnOverrides: { [service.id]: { mode: "custom", date: "2026-11-15" } } }, database);
      records = await tx.select().from(procedureReturns).where(eq(procedureReturns.appointmentId, appointment.id));
      assert.equal(records[0].dueDate, "2026-11-15"); assertions++;
      await updateAppointmentAndInventory({ ...input, appointmentId: next.id, returnOverrides: { [service.id]: { mode: "disabled" } } }, database);
      list = await getProcedureReturns(organization.id, organization.timezone, client.id, new Date("2026-10-11T12:00:00Z"), database);
      assert.equal(list.length, 0); assertions++;
      await updateAppointmentAndInventory({ ...input, appointmentId: next.id, status: "no_show" }, database);
      records = await tx.select().from(procedureReturns).where(and(eq(procedureReturns.organizationId, organization.id), eq(procedureReturns.appointmentId, next.id)));
      assert.equal(records.length, 0); assertions++;
      list = await getProcedureReturns(organization.id, organization.timezone, client.id, new Date("2026-10-11T12:00:00Z"), database);
      assert.equal(list[0].dueDate, "2026-11-15"); assertions++;
      assert.equal((await getProcedureReturns(crypto.randomUUID(), organization.timezone, client.id, new Date(), database)).length, 0); assertions++;
      const [additional] = await tx.insert(services).values({ organizationId: organization.id, name: "Procedimento adicional", durationMinutes: 30, priceInCents: 0, returnInterval: 10 }).returning();
      const [extraAppointment] = await tx.insert(appointments).values({ organizationId: organization.id, clientId: client.id, serviceId: service.id, startsAt: new Date("2026-09-20T15:00:00Z"), endsAt: new Date("2026-09-20T15:30:00Z"), priceInCents: 0, metadata: { primaryProcedureRemoved: true } }).returning();
      const [sale] = await tx.insert(retailSales).values({ organizationId: organization.id, clientId: client.id, attendanceId: extraAppointment.id, subtotalInCents: 0, totalInCents: 0 }).returning();
      await tx.insert(retailSaleItems).values({ organizationId: organization.id, saleId: sale.id, serviceId: additional.id, productName: additional.name, variantName: "Procedimento adicional", quantity: 1, unitPriceInCents: 0, totalInCents: 0 });
      await assert.rejects(updateAppointmentAndInventory({ ...input, appointmentId: extraAppointment.id, returnOverrides: { [additional.id]: { mode: "custom", date: "2026-09-19" } } }, database));
      assert.equal((await tx.select().from(procedureReturns).where(eq(procedureReturns.appointmentId, extraAppointment.id))).length, 0); assertions++;
      assert.equal((await tx.select().from(appointments).where(eq(appointments.id, extraAppointment.id)))[0].status, "scheduled"); assertions++;
      await updateAppointmentAndInventory({ ...input, appointmentId: extraAppointment.id }, database);
      records = await tx.select().from(procedureReturns).where(eq(procedureReturns.appointmentId, extraAppointment.id));
      assert.equal(records.length, 1); assert.equal(records[0].serviceId, additional.id); assert.equal(records[0].dueDate, "2026-09-30"); assertions += 3;
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  console.log(`${assertions} verificações de integração passaram. Dados de teste revertidos por rollback.`);
  await db.$client.end();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
