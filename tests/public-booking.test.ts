import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableColumns } from "drizzle-orm";
import type { db } from "../src/db";
import * as schema from "../src/db/schema";
import { PortalPatients } from "../src/lib/portal-patients";

test("public portal: verified identity, authorized dependents, replay, overlapping times and repeated sessions", async () => {
  const pg = new PGlite();
  const scope = globalThis as typeof globalThis & { bookingTestDb?: unknown; bookingEffects?: number; bookingEmail?: { code: string; accessUrl: string } };
  const previousSecret = process.env.BETTER_AUTH_SECRET, previousEmail = process.env.RESEND_API_KEY;
  try {
    process.env.BETTER_AUTH_SECRET = "isolated-public-portal-test-secret"; process.env.RESEND_API_KEY = "synthetic";
    const tables = { users: schema.users, clients: schema.clients, services: schema.services, organizations: schema.organizations, professionals: schema.professionals, appointments: schema.appointments, client_portal_sessions: schema.clientPortalSessions, client_portal_access_requests: schema.clientPortalAccessRequests, payment_charges: schema.paymentCharges, audit_logs: schema.auditLogs };
    for (const [name, table] of Object.entries(tables)) {
      const columns = Object.values(getTableColumns(table)).filter(column => !(name === "services" && column.name === "public_repeat_policy")).map(column => `"${column.name}" ${column.enumValues ? "text" : column.getSQLType()}${column.primary ? ` PRIMARY KEY${column.getSQLType() === "uuid" ? " DEFAULT gen_random_uuid()" : ""}` : ""}${column.name === "status" && name === "appointments" ? " DEFAULT 'scheduled'" : column.name === "attempts" ? " DEFAULT 0" : column.name === "created_at" ? " DEFAULT now()" : ""}`);
      await pg.exec(`CREATE TABLE "${name}" (${columns.join(",")})`);
    }
    await pg.exec("CREATE UNIQUE INDEX clients_org_test ON clients(organization_id,id)");
    await pg.exec(await readFile(new URL("../drizzle/0075_portal_booking_safety.sql", import.meta.url), "utf8"));
    const database = drizzle(pg, { schema }) as unknown as typeof db;
    scope.bookingTestDb = database; scope.bookingEffects = 0;
    const org = randomUUID(), otherOrg = randomUUID(), patient = randomUUID(), dependent = randomUUID(), stranger = randomUUID(), outside = randomUUID(), service = randomUUID(), otherService = randomUUID(), professional = randomUUID(), secondProfessional = randomUUID();
    await pg.query("INSERT INTO users(id) VALUES ('operator')");
    await pg.query("INSERT INTO organizations(id,slug,name,booking_enabled,timezone,booking_horizon_days,slot_interval_minutes,booking_notice_hours) VALUES ($1,'test-clinic','Clínica teste',true,'America/Bahia',60,30,0)", [org]);
    for (const [id, organizationId, name, email] of [[patient, org, "Paciente teste", "patient@example.invalid"], [dependent, org, "Dependente teste", null], [stranger, org, "Outro paciente", null], [outside, otherOrg, "Outra clínica", null]]) await pg.query("INSERT INTO clients(id,organization_id,name,email,phone) VALUES ($1,$2,$3,$4,$5)", [id, organizationId, name, email, id === patient ? "71999999999" : null]);
    for (const id of [service, otherService]) await pg.query("INSERT INTO services(id,organization_id,name,duration_minutes,price_in_cents,deposit_type,deposit_value,is_active) VALUES ($1,$2,'Procedimento teste',60,10000,'none',0,true)", [id, org]);
    for (const id of [professional, secondProfessional]) await pg.query("INSERT INTO professionals(id,organization_id,name,is_active,is_bookable) VALUES ($1,$2,'Profissional teste',true,true)", [id, org]);
    await pg.query("INSERT INTO client_portal_dependents(organization_id,guardian_id,client_id,created_by) VALUES ($1,$2,$3,'operator')", [org, patient, dependent]);
    await assert.rejects(pg.query("INSERT INTO client_portal_dependents(organization_id,guardian_id,client_id,created_by) VALUES ($1,$2,$3,'operator')", [org, patient, outside]), /foreign key/);
    const patients = new PortalPatients(database);
    assert.equal((await patients.resolve(org, patient, dependent))?.id, dependent);
    assert.equal(await patients.resolve(org, patient, stranger), undefined);
    assert.equal(await patients.resolve(otherOrg, patient, outside), undefined);
    assert.equal((await patients.list(org, patient)).length, 1);
    async function bundle(path: string) {
      const mocks: Record<string, string> = {
        "@/db": "export const db=globalThis.bookingTestDb;",
        "@/lib/availability": "export async function isTimeAvailable(){return true;}",
        "@/lib/finance": "export async function syncAppointmentFinancialEntry(){globalThis.bookingEffects++;}",
        "@/lib/google-calendar": "export async function syncAppointmentToGoogleCalendar(){} export async function deleteAppointmentFromGoogleCalendar(){}",
        "@/lib/whatsapp-notifications": "export async function enqueueAppointmentNotification(){}",
        "@/lib/email": "export async function sendAppointmentManagementEmail(){} export async function sendClientPortalAccessEmail(input){globalThis.bookingEmail=input;}",
        "@/lib/voucher-booking": "export async function reserveBookingVoucher(tx,org,client,code,price){return {finalPriceInCents:price,discountInCents:0};}",
        "@/lib/asaas": "export async function organizationAsaasRequest(){throw new Error('No external payments in tests');}",
        "@/lib/organization-asaas": "export async function getOrganizationAsaasCredential(){throw new Error('No external payments in tests');}",
        "@/lib/audit": "export async function writeAuditLog(){}",
      };
      const output = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "isolated-booking", setup(builder) {
        builder.onResolve({ filter: /./ }, args => mocks[args.path] ? { path: args.path, namespace: "mock" } : undefined);
        builder.onLoad({ filter: /./, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
      } }] });
      const exported = { exports: {} as { POST(request: Request, context: { params: Promise<Record<string, string>> }): Promise<Response> } };
      new Function("require", "module", "exports", output.outputFiles[0].text)(createRequire(import.meta.url), exported, exported.exports);
      return exported.exports.POST;
    }
    const requestCode = await bundle("src/app/api/public/client-portal/[slug]/request-code/route.ts");
    const verifyCode = await bundle("src/app/api/public/client-portal/[slug]/verify-code/route.ts");
    const booking = await bundle("src/app/api/public/booking/[slug]/appointments/route.ts");
    const reschedule = await bundle("src/app/api/public/appointments/[token]/route.ts");
    const request = (body: unknown, cookie = "") => new Request("http://localhost:3456/api/public/test", { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify(body) });
    const context = { params: Promise.resolve({ slug: "test-clinic" }) };
    const unknown = await requestCode(request({ identifier: "unknown@example.invalid" }), context);
    const known = await requestCode(request({ identifier: "patient@example.invalid", serviceId: service }), context);
    assert.deepEqual(await unknown.json(), await known.json());
    assert.ok(unknown.headers.getSetCookie().some(value => value.startsWith("aggenda_client_challenge=")));
    assert.ok(scope.bookingEmail?.code);
    assert.equal(new URL(scope.bookingEmail!.accessUrl).searchParams.get("servico"), service, "the email access link preserves the selected service");
    const challenge = known.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    assert.equal((await verifyCode(request({ code: "wrong" }, challenge), context)).status, 400);
    const verified = await verifyCode(request({ code: scope.bookingEmail!.code }, challenge), context);
    assert.equal(verified.status, 200);
    const cookie = verified.headers.getSetCookie().filter(value => !value.includes("Max-Age=0")).map(value => value.split(";")[0]).join("; ");
    const start = new Date(Date.now() + 3 * 86400000); start.setUTCMinutes(0, 0, 0);
    const body = { patientId: patient, serviceId: service, professionalId: professional, startsAt: start.toISOString() };
    assert.equal((await booking(request(body), context)).status, 401);
    assert.equal((await booking(request({ ...body, patientId: stranger }, cookie), context)).status, 401);
    const first = await booking(request(body, cookie), context); assert.equal(first.status, 201); const created = await first.json();
    const replay = await booking(request(body, cookie), context); assert.equal(replay.status, 200); assert.equal((await replay.json()).id, created.id); assert.equal(scope.bookingEffects, 1);
    const overlap = await booking(request({ ...body, professionalId: secondProfessional, serviceId: otherService }, cookie), context);
    assert.equal(overlap.status, 409); assert.equal((await overlap.json()).code, "CLIENT_APPOINTMENT_CONFLICT");
    const next = { ...body, startsAt: new Date(start.getTime() + 2 * 86400000).toISOString() };
    const repeat = await booking(request(next, cookie), context); assert.equal(repeat.status, 409); assert.equal((await repeat.json()).code, "SERVICE_REPEAT_CONFIRMATION");
    const session = await booking(request({ ...next, acknowledgedAppointmentIds: [created.id] }, cookie), context); assert.equal(session.status, 201);
    const second = await session.json();
    const move = await reschedule(request({ action: "reschedule", startsAt: start.toISOString() }), { params: Promise.resolve({ token: second.manageToken }) }); assert.equal(move.status, 409);
    await pg.query("UPDATE services SET public_repeat_policy='block' WHERE id=$1", [service]);
    const blocked = await booking(request({ ...next, startsAt: new Date(start.getTime() + 4 * 86400000).toISOString(), acknowledgedAppointmentIds: [created.id, second.id] }, cookie), context); assert.equal((await blocked.json()).code, "SERVICE_REPEAT_BLOCKED");
    assert.equal((await booking(request({ ...body, patientId: dependent }, cookie), context)).status, 201);
    await pg.query("DELETE FROM client_portal_dependents");
    assert.equal((await booking(request({ ...next, patientId: dependent }, cookie), context)).status, 401);
    assert.equal((await pg.query("SELECT id FROM appointments WHERE client_id=$1", [patient])).rows.length, 2);
    const concurrentStart = new Date(start.getTime() + 6 * 86400000).toISOString();
    const concurrent = await Promise.all([professional, secondProfessional].map(professionalId => booking(request({ patientId: patient, serviceId: otherService, professionalId, startsAt: concurrentStart }, cookie), context)));
    assert.deepEqual(concurrent.map(response => response.status).sort(), [201, 409]);
    assert.equal((await pg.query("SELECT id FROM appointments WHERE client_id=$1 AND starts_at=$2", [patient, concurrentStart])).rows.length, 1);
  } finally {
    delete scope.bookingTestDb; delete scope.bookingEffects; delete scope.bookingEmail;
    if (previousSecret === undefined) delete process.env.BETTER_AUTH_SECRET; else process.env.BETTER_AUTH_SECRET = previousSecret;
    if (previousEmail === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previousEmail;
    await pg.close();
  }
});
