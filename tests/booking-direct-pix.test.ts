import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableColumns } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { createDirectPixPayload, normalizePixKey, pixCrc16 } from "../src/lib/booking-payment";

test("Pix payload uses BR Code fields, amount, normalized key and valid CRC", () => {
  const payload = createDirectPixPayload({ key: normalizePixKey("phone", "(71) 99181-4240"), receiverName: "Clínica Teste", city: "São Paulo", amountInCents: 1255, reference: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" });
  assert.ok(payload.includes("br.gov.bcb.pix")); assert.ok(payload.includes("+5571991814240"));
  assert.ok(payload.includes("540512.55")); assert.ok(payload.includes("CLINICA TESTE")); assert.ok(payload.includes("SAO PAULO"));
  assert.equal(payload.slice(-4), pixCrc16(payload.slice(0, -4)));
  assert.equal(pixCrc16("123456789"), "29B1");
  assert.throws(() => normalizePixKey("email", "invalid"));
  assert.throws(() => createDirectPixPayload({ key: "test@example.invalid", receiverName: "Teste", city: "Teste", amountInCents: 0, reference: "1" }));
});

test("direct Pix: reserve, replay, report, staff confirmation, tenant isolation and remaining balance", async () => {
  const pg = new PGlite();
  const scope = globalThis as typeof globalThis & { pixTestDb?: unknown; pixOrg?: unknown; pixNotifications?: number };
  try {
    const tables = { organizations: schema.organizations, clients: schema.clients, services: schema.services, professionals: schema.professionals, appointments: schema.appointments, audit_logs: schema.auditLogs, financial_accounts: schema.financialAccounts, financial_entries: schema.financialEntries, payment_charges: schema.paymentCharges, cash_movements: schema.cashMovements, payment_methods: schema.paymentMethods, retail_sale_payments: schema.retailSalePayments };
    for (const [name, table] of Object.entries(tables)) {
      const columns = Object.values(getTableColumns(table)).filter(column => !(name === "organizations" && column.name === "booking_payment_settings")).map(column => `"${column.name}" ${column.enumValues ? "text" : column.getSQLType()}${column.primary ? ` PRIMARY KEY${column.getSQLType() === "uuid" ? " DEFAULT gen_random_uuid()" : ""}` : ""}${column.name === "status" && name === "appointments" ? " DEFAULT 'scheduled'" : column.name === "created_at" ? " DEFAULT now()" : ""}`);
      await pg.exec(`CREATE TABLE "${name}" (${columns.join(",")})`);
    }
    await pg.exec(await readFile(new URL("../drizzle/0100_booking_direct_pix.sql", import.meta.url), "utf8"));
    await pg.exec("CREATE UNIQUE INDEX financial_appointment_test ON financial_entries(appointment_id)");
    const ledgerMigration = await readFile(new URL("../drizzle/0093_payment_catalog_cash_ledger.sql", import.meta.url), "utf8");
    await pg.exec(ledgerMigration.slice(ledgerMigration.indexOf("CREATE FUNCTION aggenda_cash_movement()")));
    const database = drizzle(pg, { schema }); scope.pixTestDb = database; scope.pixNotifications = 0;
    const org = randomUUID(), account = randomUUID(), client = randomUUID(), service = randomUUID(), professional = randomUUID();
    const settings = { mode: "pix_direct", keyType: "email", key: "pix@example.invalid", receiverName: "Empresa Teste", city: "Salvador", accountId: account };
    scope.pixOrg = { session: { user: { id: "test-operator" } }, organization: { id: org, role: "owner", timezone: "America/Bahia", bookingPaymentSettings: settings } };
    await pg.query("INSERT INTO organizations(id,slug,name,booking_enabled,timezone,booking_horizon_days,slot_interval_minutes,booking_notice_hours,booking_payment_settings) VALUES($1,'pix-test','Empresa teste',true,'America/Bahia',60,30,0,$2)", [org, settings]);
    await pg.query("INSERT INTO financial_accounts(id,organization_id,name,is_active) VALUES($1,$2,'banco',true)", [account, org]);
    await pg.query("INSERT INTO clients(id,organization_id,name,phone) VALUES($1,$2,'Cliente fictício','71999999999')", [client, org]);
    await pg.query("INSERT INTO professionals(id,organization_id,name,is_active,is_bookable) VALUES($1,$2,'Profissional teste',true,true)", [professional, org]);
    await pg.query("INSERT INTO services(id,organization_id,name,duration_minutes,price_in_cents,deposit_type,deposit_value,deposit_expiration_minutes,public_repeat_policy,is_active) VALUES($1,$2,'Serviço teste',60,10000,'percentage',30,30,'warn',true)", [service, org]);
    const mocks: Record<string, string> = {
      "@/db": "export const db=globalThis.pixTestDb;",
      "@/lib/session": "export async function requireOrganization(){return globalThis.pixOrg;}",
      "@/lib/portal-request": `export async function portalRequestClient(){return {id:'${client}',name:'Cliente fictício',phone:'71999999999',email:null};}`,
      "@/lib/permissions": "export function assertOrganizationPermission(role){if(role!=='owner')throw new Error('Forbidden');}",
      "@/lib/availability": "export async function isTimeAvailable(){return true;}",
      "@/lib/google-calendar": "export async function syncAppointmentToGoogleCalendar(){} export async function deleteAppointmentFromGoogleCalendar(){}",
      "@/lib/whatsapp-notifications": "export async function enqueueAppointmentNotification(){globalThis.pixNotifications++;}",
      "@/lib/email": "export async function sendAppointmentManagementEmail(){}",
      "@/lib/voucher-booking": "export async function reserveBookingVoucher(tx,org,client,code,price){return {finalPriceInCents:price,discountInCents:0};}",
      "@/lib/asaas": "export async function organizationAsaasRequest(){throw new Error('External provider must not be called');}",
      "@/lib/organization-asaas": "export async function getOrganizationAsaasCredential(){throw new Error('External provider must not be called');}",
      "@/lib/audit": "export async function writeAuditLog(){}",
      "next/cache": "export function revalidatePath(){}",
    };
    async function bundle(path: string) {
      const output = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "isolated-pix", setup(builder) {
        builder.onResolve({ filter: /./ }, args => mocks[args.path] ? { path: args.path, namespace: "mock" } : undefined);
        builder.onLoad({ filter: /./, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
      } }] });
      const exported = { exports: {} as Record<string, (...args: never[]) => Promise<unknown>> };
      new Function("require", "module", "exports", output.outputFiles[0].text)(createRequire(import.meta.url), exported, exported.exports);
      return exported.exports as Record<string, (...args: unknown[]) => Promise<unknown>>;
    }
    const booking = (await bundle("src/app/api/public/booking/[slug]/appointments/route.ts")).POST;
    const report = (await bundle("src/app/api/public/appointments/[token]/pix/route.ts")).POST;
    const actions = await bundle("src/actions/booking-payment.ts");
    const finance = await bundle("src/lib/finance.ts");
    const request = (body: unknown) => new Request("http://localhost/api/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const start = new Date(Date.now() + 2 * 86400000); start.setUTCMinutes(0, 0, 0);
    const body = { serviceId: service, professionalId: professional, startsAt: start.toISOString() };
    const context = { params: Promise.resolve({ slug: "pix-test" }) };
    const response = await booking(request(body), context) as Response;
    assert.equal(response.status, 201); const created = await response.json(); assert.equal(created.directPix, true); assert.equal(created.paymentUrl, undefined);
    assert.equal(scope.pixNotifications, 0, "unpaid reservation sends no confirmation");
    let item = (await pg.query<{ deposit_status: string; metadata: { directPix: { entryId: string; key: string } } }>("SELECT * FROM appointments WHERE id=$1", [created.id])).rows[0];
    assert.equal(item.deposit_status, "direct_pending");
    const entries = () => pg.query<{ amount_in_cents: number; status: string; source: string }>("SELECT * FROM financial_entries ORDER BY amount_in_cents");
    assert.deepEqual((await entries()).rows.map(row => row.amount_in_cents), [3000, 7000]);
    await pg.query("UPDATE organizations SET booking_payment_settings=$1 WHERE id=$2", [{ mode: "integrated" }, org]);
    const replay = await booking(request(body), context) as Response; assert.equal(replay.status, 200); assert.equal((await replay.json()).id, created.id); assert.equal((await entries()).rows.length, 2);
    await pg.query("UPDATE organizations SET booking_payment_settings=$1 WHERE id=$2", [settings, org]);
    const token = { params: Promise.resolve({ token: created.manageToken }) };
    assert.equal((await report(request({ action: "report_paid" }), token) as Response).status, 200);
    assert.equal((await report(request({ action: "report_paid" }), token) as Response).status, 200);
    item = (await pg.query<typeof item>("SELECT * FROM appointments WHERE id=$1", [created.id])).rows[0];
    assert.equal(item.deposit_status, "direct_review"); assert.ok((await entries()).rows.every(row => row.status === "pending"));
    // A later settings change must not change the account/key saved in the reservation.
    await pg.query("UPDATE organizations SET booking_payment_settings=$1 WHERE id=$2", [{ ...settings, key: "new@example.invalid" }, org]);
    const data = new FormData(); data.set("id", created.id);
    assert.ok((await actions.confirmBookingDirectPix(data) as { error: string }).error);
    data.set("verified", "on");
    const originalScope = scope.pixOrg;
    scope.pixOrg = { session: { user: { id: "other" } }, organization: { id: randomUUID(), role: "owner", timezone: "America/Bahia" } };
    assert.ok((await actions.confirmBookingDirectPix(data) as { error: string }).error);
    scope.pixOrg = originalScope;
    assert.equal(await actions.confirmBookingDirectPix(data), undefined);
    assert.equal(scope.pixNotifications, 1);
    assert.equal((await entries()).rows.find(row => row.source === "appointment_deposit_direct")?.status, "received");
    assert.ok((await actions.confirmBookingDirectPix(data) as { error: string }).error);
    assert.equal(scope.pixNotifications, 1, "replay never posts or notifies twice");
    assert.equal((await pg.query<{ total: number }>("SELECT sum(amount_in_cents)::int AS total FROM cash_movements")).rows[0].total, 3000, "the bank statement receives the deposit exactly once");
    await finance.syncAppointmentFinancialEntry(created.id);
    assert.deepEqual((await entries()).rows.map(row => row.amount_in_cents), [3000, 7000], "reschedule/sync preserves the remaining balance");
    await pg.query("UPDATE appointments SET status='cancelled' WHERE id=$1", [created.id]);
    await finance.syncAppointmentFinancialEntry(created.id);
    assert.equal((await entries()).rows.find(row => row.source === "appointment_deposit_direct")?.status, "received", "cancellation must not silently refund an actual Pix");
    assert.equal((await report(request({ action: "report_paid" }), token) as Response).status, 409);
    // A new unpaid reservation expires; a payment reported in time stays for staff review.
    const second = await (await booking(request({ ...body, startsAt: new Date(start.getTime() + 86400000).toISOString() }), context) as Response).json();
    await pg.query("UPDATE appointments SET reservation_expires_at=now()-interval '1 minute' WHERE id=$1", [second.id]);
    assert.equal((await report(request({ action: "report_paid" }), { params: Promise.resolve({ token: second.manageToken }) }) as Response).status, 409);
    const previousCron = process.env.CRON_SECRET; process.env.CRON_SECRET = "synthetic-cron";
    try {
      const cron = (await bundle("src/app/api/cron/booking-reservations/route.ts")).GET;
      const result = await cron(new Request("http://localhost/api/test", { headers: { authorization: "Bearer synthetic-cron" } })) as Response;
      assert.equal((await result.json()).expired, 1);
      assert.equal((await pg.query<{ status: string }>("SELECT status FROM financial_entries WHERE attendance_id=$1", [second.id])).rows[0].status, "cancelled");
    } finally { if (previousCron === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previousCron; }
    const shared = (await bundle("src/lib/create-booking-reservation.ts")).createBookingReservation;
    const whatsappBody = {...body,startsAt:new Date(start.getTime()+3*86400000).toISOString()};
    const whatsappOrigin = {source:"whatsapp",messageId:randomUUID(),conversationId:randomUUID()};
    const customer = {id:client,name:"Cliente fictício",phone:"71999999999",email:null};
    const whatsappResponse = await shared(request(whatsappBody),"pix-test",customer,whatsappOrigin) as Response;
    assert.equal(whatsappResponse.status,201);
    const whatsappResult = await whatsappResponse.json();
    const whatsappItem = (await pg.query<{source:string;deposit_status:string;reservation_expires_at:string;metadata:{whatsappCommandMessageId:string}}>("SELECT * FROM appointments WHERE id=$1",[whatsappResult.id])).rows[0];
    assert.equal(whatsappItem.source,"whatsapp");
    assert.equal(whatsappItem.deposit_status,"direct_pending");
    assert.ok(whatsappItem.reservation_expires_at);
    assert.equal(whatsappItem.metadata.whatsappCommandMessageId,whatsappOrigin.messageId);
    const repeatedWhatsapp = await shared(request(whatsappBody),"pix-test",customer,whatsappOrigin) as Response;
    assert.equal((await repeatedWhatsapp.json()).id,whatsappResult.id);
    assert.equal((await pg.query("SELECT * FROM financial_entries WHERE attendance_id=$1",[whatsappResult.id])).rows.length,1,"a retry cannot duplicate the deposit");
    const qrRoute=(await bundle("src/app/api/public/appointments/[token]/pix/qr/route.ts")).GET;
    const qrParams={params:Promise.resolve({token:whatsappResult.manageToken})};
    const png=await qrRoute(request({}),qrParams) as Response;
    assert.equal(png.status,200);
    assert.equal(png.headers.get("Content-Type"),"image/png");
    assert.match(png.headers.get("Cache-Control")!,/no-store/);
    assert.deepEqual(Array.from(new Uint8Array(await png.arrayBuffer()).slice(0,8)),[137,80,78,71,13,10,26,10]);
    await pg.query("UPDATE appointments SET reservation_expires_at=now()-interval '1 minute' WHERE id=$1",[whatsappResult.id]);
    assert.equal((await qrRoute(request({}),qrParams) as Response).status,410);
    await pg.query("UPDATE appointments SET reservation_expires_at=now()+interval '30 minutes',deposit_status='paid' WHERE id=$1",[whatsappResult.id]);
    assert.equal((await qrRoute(request({}),qrParams) as Response).status,410);
    await pg.query("UPDATE appointments SET deposit_status='direct_pending' WHERE id=$1",[whatsappResult.id]);

  } finally { delete scope.pixTestDb; delete scope.pixOrg; delete scope.pixNotifications; await pg.close(); }
});
