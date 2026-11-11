import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "../src/db/schema";

test("service qualifications save atomically, isolate tenants and govern real availability", async () => {
  const pg = new PGlite();
  const db = drizzle(pg);
  const key = `serviceLinks${randomUUID().replaceAll("-", "")}`;
  Object.assign(globalThis, {[key]: db});
  async function load<T>(path: string): Promise<T> {
    const bundle = await build({entryPoints: [path], bundle: true, write: false, format: "cjs", platform: "node", packages: "external", plugins: [{name: key, setup(builder) {
      builder.onResolve({filter: /^@\/db$/}, () => ({path: "db", namespace: key}));
      builder.onLoad({filter: /./, namespace: key}, () => ({contents: `export const db=globalThis.${key}`, loader: "js"}));
    }}]});
    const exported = {exports: {} as T};
    new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), exported, exported.exports);
    return exported.exports;
  }
  try {
    const tables = {services: schema.services, professionals: schema.professionals, services_to_professionals: schema.servicesToProfessionals, weekly_availability: schema.weeklyAvailability, availability_exceptions: schema.availabilityExceptions, rooms: schema.rooms, appointments: schema.appointments};
    for (const [name, table] of Object.entries(tables)) {
      const columns = Object.values(getTableColumns(table)).map(column => {
        const type = column.enumValues ? "text" : column.getSQLType();
        const fallback = column.primary && type === "uuid" ? " DEFAULT gen_random_uuid()" : ["created_at", "updated_at"].includes(column.name) ? " DEFAULT now()" : typeof column.default === "string" ? ` DEFAULT '${column.default.replaceAll("'", "''")}'` : typeof column.default === "boolean" || typeof column.default === "number" ? ` DEFAULT ${column.default}` : "";
        return `"${column.name}" ${type}${column.primary ? " PRIMARY KEY" : ""}${fallback}`;
      });
      await pg.exec(`CREATE TABLE "${name}" (${columns.join(",")})`);
    }
    await pg.exec("CREATE UNIQUE INDEX link_unique ON services_to_professionals(service_id,professional_id)");
    const org = randomUUID(), other = randomUUID(), service = randomUUID(), a = randomUUID(), b = randomUUID(), foreign = randomUUID();
    await pg.query("INSERT INTO services(id,organization_id,name,duration_minutes,is_active) VALUES ($1,$2,'Serviço teste',30,true)", [service, org]);
    for (const [id, organizationId] of [[a, org], [b, org], [foreign, other]]) await pg.query("INSERT INTO professionals(id,organization_id,name,is_active,is_bookable) VALUES ($1,$2,'Atendente teste',true,true)", [id, organizationId]);
    const date = new Date(); date.setUTCDate(date.getUTCDate() + 7); date.setUTCHours(12, 0, 0, 0);
    await pg.query("INSERT INTO weekly_availability(organization_id,day_of_week,starts_at,ends_at) VALUES ($1,$2,'09:00','10:00')", [org, date.getUTCDay()]);
    const links = await load<{serviceProfessionalIds: (form: FormData) => string[] | null; replaceServiceProfessionals: (tx: unknown, org: string, service: string, ids: string[]) => Promise<void>}>("src/lib/service-professionals.ts");
    const availability = await load<{getAvailableTimes: (input: {organizationId:string; timezone:string; date:string; serviceId:string; professionalId?:string}) => Promise<string[]>}>("src/lib/availability.ts");
    const input = {organizationId: org, timezone: "America/Bahia", date: date.toISOString().slice(0, 10), serviceId: service};
    const form = new FormData();
    assert.equal(links.serviceProfessionalIds(form), null, "old forms preserve links");
    form.set("professionalLinksSubmitted", "1"); form.append("professionalIds", a); form.append("professionalIds", a);
    assert.deepEqual(links.serviceProfessionalIds(form), [a]);
    assert.deepEqual(await availability.getAvailableTimes({...input, professionalId: a}), [], "no links must not mean all attendants");
    await db.transaction(tx => links.replaceServiceProfessionals(tx, org, service, [a, b]));
    assert.equal((await availability.getAvailableTimes({...input, professionalId: a})).length, 2);
    assert.equal((await availability.getAvailableTimes(input)).length, 2, "unassigned availability is the deduplicated union of qualified attendants");
    await assert.rejects(db.transaction(tx => links.replaceServiceProfessionals(tx, org, service, [foreign])), /desta empresa/);
    assert.equal((await pg.query("SELECT * FROM services_to_professionals")).rows.length, 2, "failed replacement preserves current links");
    await pg.query("UPDATE professionals SET is_active=false WHERE id=$1", [b]);
    await db.transaction(tx => links.replaceServiceProfessionals(tx, org, service, [a, b]));
    assert.deepEqual(await availability.getAvailableTimes({...input, professionalId: b}), [], "retained inactive links do not offer slots");
    await db.transaction(tx => links.replaceServiceProfessionals(tx, org, service, [a]));
    await assert.rejects(db.transaction(tx => links.replaceServiceProfessionals(tx, org, service, [b])), /ativos/);
    await pg.query("UPDATE professionals SET is_bookable=false WHERE id=$1", [a]);
    assert.deepEqual(await availability.getAvailableTimes({...input, professionalId: a}), []);
    await db.transaction(tx => links.replaceServiceProfessionals(tx, org, service, []));
    assert.deepEqual(await availability.getAvailableTimes(input), []);
    assert.equal((await pg.query("SELECT id FROM services")).rows.length, 1);
  } finally {Reflect.deleteProperty(globalThis, key); await pg.close();}
});
