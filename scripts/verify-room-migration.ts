import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { Client } from "pg";
import { normalizeDatabaseUrl } from "../src/lib/database-url";
loadEnvConfig(process.cwd());
const taskUrl = new URL(normalizeDatabaseUrl(process.env.DATABASE_URL!));
taskUrl.hostname = taskUrl.hostname.replace("-pooler", "");
const connectionString = taskUrl.href;
const schema = `aggenda_room_test_${randomUUID().replaceAll("-", "")}`;
async function main() {
 const c = new Client({ connectionString }); await c.connect();
 const second = new Client({ connectionString });
 let testPool: { end: () => Promise<void> } | undefined;
 try {
  await c.query(`create schema "${schema}"`);
  await c.query(`set search_path to "${schema}", public`);
  for (const table of ["organizations", "clients", "services", "appointments", "weekly_availability", "availability_exceptions", "services_to_professionals"]) await c.query(`create table "${table}" (like public."${table}" including defaults including constraints including indexes)`);
  await c.query("alter table appointments drop column if exists room_id");
  const migration = (await readFile("drizzle/0065_appointment_rooms.sql", "utf8")).replace(/^\uFEFF/, "");
  for (const statement of migration.split("--> statement-breakpoint")) if (statement.trim()) await c.query(statement);
  const org = (await c.query("insert into organizations (name,slug) values ('Teste sala',$1) returning id", [randomUUID()])).rows[0].id;
  const otherOrg = (await c.query("insert into organizations (name,slug) values ('Outra clínica',$1) returning id", [randomUUID()])).rows[0].id;
  const client = (await c.query("insert into clients (organization_id,name) values ($1,'Cliente teste') returning id", [org])).rows[0].id;
  const service = (await c.query("insert into services (organization_id,name,duration_minutes) values ($1,'Procedimento teste',30) returning id", [org])).rows[0].id;
  const insert = "insert into appointments (organization_id,client_id,service_id,starts_at,ends_at,room_id) values ($1,$2,$3,$4,$5,$6) returning id,room_id";
  const values = (start: string, end: string, room: string | null = null) => [org, client, service, `2030-01-01 ${start}`, `2030-01-01 ${end}`, room];
  const old = (await c.query(insert, values("07:00", "07:30"))).rows[0]; assert.equal(old.room_id, null);
  const room = (await c.query("insert into rooms (organization_id,name) values ($1,'Sala 1') returning id", [org])).rows[0].id;
  const foreignRoom = (await c.query("insert into rooms (organization_id,name) values ($1,'Sala externa') returning id", [otherOrg])).rows[0].id;
  const booking = (await c.query(insert, values("09:00", "09:30"))).rows[0]; assert.equal(booking.room_id, room);
  await assert.rejects(c.query(insert, values("09:15", "09:45", room)), /já está reservada/);
  await assert.rejects(c.query(insert, values("09:15", "09:45")), /Nenhuma sala disponível/);
  await assert.rejects(c.query(insert, values("10:00", "10:30", foreignRoom)), /Sala inválida/);
  await c.query(insert, values("09:30", "10:00", room));
  await c.query("update appointments set status='cancelled' where id=$1", [booking.id]);
  await c.query(insert, values("09:00", "09:30", room));
  await assert.rejects(c.query("update appointments set status='scheduled' where id=$1",[booking.id]), /já está reservada/);
  await c.query("update rooms set is_active=false where id=$1",[room]);
  await assert.rejects(c.query(insert, values("11:00", "11:30", room)), /inativa/);
  await c.query("update rooms set is_active=true where id=$1",[room]);
  // Two sessions book simultaneously: the second must see the committed room reservation.
  await second.connect(); await second.query(`set search_path to "${schema}", public`);
  await c.query("begin"); await c.query(insert, values("12:00", "12:30", room));
  const concurrent = second.query(insert, values("12:00", "12:30", room)).then(() => false, error => /já está reservada/.test(error.message));
  await c.query("commit"); assert.equal(await concurrent, true);
  const room2 = (await c.query("insert into rooms (organization_id,name) values ($1,'Sala 2') returning id", [org])).rows[0].id;
  assert.equal((await c.query(insert, values("12:00", "12:30"))).rows[0].room_id, room2);
  // Exercise the actual availability helper against the same isolated schema.
  await c.query("insert into weekly_availability (organization_id,day_of_week,starts_at,ends_at) values ($1,2,'09:00','14:00')", [org]);
  const isolatedUrl = new URL(connectionString);
  isolatedUrl.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = isolatedUrl.href;
  const { getAvailableTimes } = await import("../src/lib/availability");
  const { db } = await import("../src/db");
  testPool = db.$client;
  const base = { organizationId: org, timezone: "America/Bahia", date: "2030-01-01", serviceId: service, professionalId: randomUUID() };
  const slot = (hour: string) => `2030-01-01T${hour}:00.000Z`;
  const automatic = await getAvailableTimes(base);
  assert.ok(!automatic?.includes(slot("12:00"))); // Both rooms occupied at UTC 12:00.
  assert.ok(automatic?.includes(slot("12:30"))); // Both rooms free at UTC 12:30.
  // Fixture timestamps are raw database local UTC: reserve at 15:00 for helper's Bahia slots.
  await c.query(insert, values("15:00", "15:30", room));
  const selectedRoom = await getAvailableTimes({ ...base, roomId: room });
  assert.ok(!selectedRoom?.includes(slot("15:00")));
  const alternative = await getAvailableTimes({ ...base, roomId: room2 });
  assert.ok(alternative?.includes(slot("15:00")));
  const invalid = await getAvailableTimes({ ...base, roomId: foreignRoom }); assert.deepEqual(invalid, []);
  const block = (await c.query("insert into availability_exceptions (organization_id,professional_id,type,starts_at,ends_at,reason) values ($1,$2,'blocked','2030-01-01 15:15','2030-01-01 16:00','Teste bloqueio') returning id", [org, base.professionalId])).rows[0].id;
  assert.ok(!(await getAvailableTimes({ ...base, roomId: room2 }))?.includes(slot("15:00")));
  assert.ok(!(await getAvailableTimes({ ...base, roomId: room2 }))?.includes(slot("15:30")));
  assert.ok((await getAvailableTimes({ ...base, professionalId: randomUUID(), roomId: room2 }))?.includes(slot("15:30")));
  assert.ok((await getAvailableTimes({ ...base, roomId: room2 }))?.includes(slot("16:00")));
  await c.query("delete from availability_exceptions where id=$1", [block]);
  assert.ok((await getAvailableTimes({ ...base, roomId: room2 }))?.includes(slot("15:30")));
  await c.query("insert into availability_exceptions (organization_id,type,starts_at,ends_at,reason) values ($1,'blocked','2030-01-01 15:00','2030-01-01 16:00','Bloqueio geral')", [org]);
  assert.ok(!(await getAvailableTimes({ ...base, professionalId: randomUUID(), roomId: room2 }))?.includes(slot("15:30")));
  console.log("OK: bloqueio do profissional, demais profissionais disponíveis, horário adjacente, remoção e bloqueio geral.");

  console.log("OK: migração em esquema isolado, atribuição automática, sobreposição, horários adjacentes, cancelamento, reativação, sala inativa, isolamento por clínica e duas reservas simultâneas.");
 } finally {
  await testPool?.end();
  await second.end();
  await c.query("rollback");
  await c.query(`drop schema if exists "${schema}" cascade`);
  await c.end();
 }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
