import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "../src/db/schema";

test("equipment: exclusive across professionals/services, shared, inactive, cancellation, reschedule and tenant isolation", async () => {
  const pg = new PGlite();
  const key = `equipment${randomUUID().replaceAll("-", "")}`;
  const org = randomUUID(), other = randomUUID(), first = randomUUID(), second = randomUUID(), personA = randomUUID(), personB = randomUUID();
  try {
    const tables = { organizations: schema.organizations, services: schema.services, professionals: schema.professionals, services_to_professionals: schema.servicesToProfessionals, weekly_availability: schema.weeklyAvailability, availability_exceptions: schema.availabilityExceptions, appointments: schema.appointments, rooms: schema.rooms, audit_logs: schema.auditLogs };
    for (const [name, table] of Object.entries(tables)) {
      const columns = Object.values(getTableColumns(table)).map(column => {
        const type = column.enumValues ? "text" : column.getSQLType();
        const fallback = column.primary && type === "uuid" ? " DEFAULT gen_random_uuid()" : typeof column.default === "string" ? ` DEFAULT '${column.default}'` : typeof column.default === "boolean" || typeof column.default === "number" ? ` DEFAULT ${column.default}` : "";
        return `"${column.name}" ${type}${column.primary ? " PRIMARY KEY" : ""}${fallback}`;
      });
      await pg.exec(`CREATE TABLE "${name}" (${columns.join(",")})`);
    }
    await pg.exec(await readFile(new URL("../drizzle/0101_service_equipment.sql", import.meta.url), "utf8"));
    Object.assign(globalThis, { [key]: drizzle(pg) });
    const mockDb = `export const db=globalThis.${key}`;
    async function load(path: string) {
      const output = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{ name: key, setup(builder) {
        const mocks: Record<string, string> = { "@/db": mockDb, "@/lib/session": `export async function requireOrganization(){return {session:{user:{id:'fake'}},organization:{id:'${org}',role:'owner'}}}`, "@/lib/permissions": "export function assertOrganizationPermission(){}", "next/cache": "export function revalidatePath(){}" };
        builder.onResolve({ filter: /./ }, args => mocks[args.path] ? { path: args.path, namespace: key } : undefined);
        builder.onLoad({ filter: /./, namespace: key }, args => ({ contents: mocks[args.path], loader: "js" }));
      } }] });
      const exported = { exports: {} as Record<string, (...args: never[]) => Promise<unknown>> };
      new Function("require", "module", "exports", output.outputFiles[0].text)(createRequire(import.meta.url), exported, exported.exports);
      return exported.exports as Record<string, (...args: unknown[]) => Promise<unknown>>;
    }
    await pg.query("INSERT INTO organizations(id) VALUES($1),($2)", [org, other]);
    for (const id of [first, second]) await pg.query("INSERT INTO services(id,organization_id,name,duration_minutes,is_active) VALUES($1,$2,'Teste',60,true)", [id, org]);
    for (const id of [personA, personB]) {
      await pg.query("INSERT INTO professionals(id,organization_id,is_active,is_bookable) VALUES($1,$2,true,true)", [id, org]);
      await pg.query("INSERT INTO services_to_professionals(organization_id,service_id,professional_id) VALUES($1,$2,$3)", [org, second, id]);
    }
    const device = randomUUID();
    await pg.query("INSERT INTO equipment(id,organization_id,name) VALUES($1,$2,'Laser')", [device, org]);
    for (const id of [first, second]) await pg.query("INSERT INTO services_to_equipment(organization_id,service_id,equipment_id) VALUES($1,$2,$3)", [org, id, device]);
    await assert.rejects(pg.query("INSERT INTO services_to_equipment(organization_id,service_id,equipment_id) VALUES($1,$2,$3)", [other, first, device]), /outra empresa/);
    const day = new Date(Date.now() + 7 * 86400000); day.setUTCHours(12, 0, 0, 0);
    const start = day.toISOString(), end = new Date(day.getTime() + 3600000).toISOString();
    const a = randomUUID();
    const insert = (id: string, service = second, person = personB, from = start, to = end) => pg.query("INSERT INTO appointments(id,organization_id,professional_id,service_id,starts_at,ends_at,status) VALUES($1,$2,$3,$4,$5,$6,'scheduled')", [id, org, person, service, from, to]);
    await insert(a, first, personA);
    await assert.rejects(insert(randomUUID()), /já está em uso/);
    const adjacent = randomUUID(); await insert(adjacent, second, personB, end, new Date(day.getTime() + 7200000).toISOString());
    await assert.rejects(pg.query("UPDATE appointments SET starts_at=$1,ends_at=$2 WHERE id=$3", [start, end, adjacent]), /já está em uso/);
    const availability = await load("src/lib/availability.ts");
    await pg.query("INSERT INTO weekly_availability(organization_id,day_of_week,starts_at,ends_at) VALUES($1,$2,'09:00','10:00')", [org, day.getUTCDay()]);
    const input = { organizationId: org, timezone: "America/Bahia", date: day.toISOString().slice(0, 10), serviceId: second, professionalId: personB };
    assert.deepEqual(await availability.getAvailableTimes(input), [], "another professional's equipment blocks offered slots");
    await pg.query("UPDATE appointments SET status='cancelled' WHERE id=$1", [a]);
    assert.equal((await availability.getAvailableTimes(input) as string[]).length, 1);
    const b = randomUUID(); await insert(b);
    await pg.query("UPDATE equipment SET allows_concurrent=true WHERE id=$1", [device]);
    const c = randomUUID(); await insert(c, first, personA);
    const actions = await load("src/actions/equipment.ts");
    const form = new FormData(); form.set("id", device); form.set("name", "Laser"); form.set("isActive", "true"); form.set("allowsConcurrent", "false"); form.append("serviceIds", first); form.append("serviceIds", second);
    assert.match((await actions.saveEquipment(form) as { error: string }).error, /sobrepostos/);
    form.set("allowsConcurrent", "true"); form.set("isActive", "false");
    assert.match((await actions.saveEquipment(form) as { error: string }).error, /futuros/);
    form.set("id", randomUUID()); assert.match((await actions.saveEquipment(form) as { error: string }).error, /não encontrado/);
    await pg.query("UPDATE equipment SET is_active=false WHERE id=$1", [device]);
    assert.deepEqual(await availability.getAvailableTimes(input), []);
    await assert.rejects(insert(randomUUID()), /está inativo/);
    await pg.query("UPDATE appointments SET status='cancelled' WHERE id=$1", [b]);
    await pg.query("UPDATE equipment SET is_active=true,allows_concurrent=false WHERE id=$1", [device]);
    await assert.rejects(pg.query("UPDATE appointments SET status='scheduled' WHERE id=$1", [b]), /já está em uso/);
    await pg.query("UPDATE appointments SET status='cancelled' WHERE id=$1", [c]);
    await pg.query("UPDATE appointments SET status='scheduled' WHERE id=$1", [b]);
  } finally { Reflect.deleteProperty(globalThis, key); await pg.close(); }
});
