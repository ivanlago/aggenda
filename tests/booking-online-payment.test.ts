import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableColumns } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

test("booking providers: configured default, durable issuance, duplicate prevention and late payment", async () => {
  const pg = new PGlite();
  const scope = globalThis as typeof globalThis & { onlineDb?: unknown; onlineCalls?: { path: string; options: { body?: Record<string, unknown> } }[]; onlineNotified?: number; onlineFailure?: boolean };
  try {
    const tables = { organizations: schema.organizations, clients: schema.clients, services: schema.services, professionals: schema.professionals, organization_financial_integrations: schema.organizationFinancialIntegrations, financial_accounts: schema.financialAccounts, payment_methods: schema.paymentMethods, payment_charges: schema.paymentCharges, financial_entries: schema.financialEntries, appointments: schema.appointments, payment_charge_events: schema.paymentChargeEvents, audit_logs: schema.auditLogs };
    for (const [name, table] of Object.entries(tables)) {
      const columns = Object.values(getTableColumns(table)).map(column => `"${column.name}" ${column.enumValues ? "text" : column.getSQLType()}${column.primary ? ` PRIMARY KEY${column.getSQLType() === "uuid" ? " DEFAULT gen_random_uuid()" : ""}` : ""}${name === "appointments" && column.name === "status" ? " DEFAULT 'scheduled'" : ""}`);
      await pg.exec(`CREATE TABLE "${name}" (${columns.join(",")})`);
    }
    await pg.exec("CREATE UNIQUE INDEX test_event_unique ON payment_charge_events(provider_event_id)");
    scope.onlineDb = drizzle(pg, { schema }); scope.onlineCalls = []; scope.onlineNotified = 0;
    const mock = `
      export async function getOrganizationAsaasCredential(){return {environment:'sandbox'}}
      export async function getMercadoPagoCredential(){return {environment:'sandbox',accessToken:'fake'}}
      export async function getPagBankCredential(){return {environment:'sandbox'}}
      export async function getEfiCredential(){return {environment:'sandbox',pixKey:'fake@example.invalid'}}
      async function call(path, credential, options={}) {
        globalThis.onlineCalls.push({path,options});
        if(globalThis.onlineFailure)throw new Error('synthetic timeout');
        if(path.startsWith('/customers?'))return {data:[{id:'customer'}]};
        if(path==='/payments')return {id:'asaas-payment',invoiceUrl:'https://sandbox.asaas.com/i/fake'};
        if(path==='/checkout/preferences')return {id:'preference',sandbox_init_point:'https://sandbox.mercadopago.com.br/checkout/fake'};
        if(path==='/checkouts')return {id:'CHEC_fake',links:[{rel:'PAY',href:'https://sandbox.pagseguro.com.br/fake'}]};
        return {pixCopiaECola:'000201synthetic'};
      }
      export const organizationAsaasRequest=call,mercadoPagoRequest=call,pagBankRequest=call,efiRequest=call;
    `;
    const clientId = randomUUID();
    const routeMocks: Record<string, string> = {
      "next/navigation": "export function useRouter(){return {refresh(){}}}",
      "@/lib/outbox-trigger": "export async function triggerOutboxWorker(){return false}",
      "@/lib/portal-request": `export async function portalRequestClient(){return {id:'${clientId}',name:'Fictício',phone:'71999999999',email:null}}`,
      "@/lib/availability": "export async function isTimeAvailable(){return true}",
      "@/lib/finance": "export async function syncAppointmentFinancialEntry(){}",
      "@/lib/email": "export async function sendAppointmentManagementEmail(){}",
      "@/lib/voucher-booking": "export async function reserveBookingVoucher(tx,org,client,code,price){return {finalPriceInCents:price,discountInCents:0}}",
    };
    async function bundle(path: string) {
      const output = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "online-isolation", setup(builder) {
        builder.onResolve({ filter: /./ }, args => routeMocks[args.path] ? { path: args.path, namespace: "mock" } : args.path === "@/db" ? { path: "db", namespace: "mock" } : /(?:^|\/)(?:organization-asaas|asaas|mercado-pago|pagbank|efi)$/.test(args.path) ? { path: "provider", namespace: "mock" } : /(?:whatsapp-notifications|google-calendar)$/.test(args.path) ? { path: "notify", namespace: "mock" } : undefined);
        builder.onLoad({ filter: /./, namespace: "mock" }, args => ({ contents: routeMocks[args.path] ?? (args.path === "db" ? "export const db=globalThis.onlineDb" : args.path === "provider" ? mock : "export async function enqueueAppointmentNotification(){globalThis.onlineNotified++} export async function syncAppointmentToGoogleCalendar(){} export async function deleteAppointmentFromGoogleCalendar(){}"), loader: "js" }));
      } }] });
      const exported = { exports: {} as Record<string, (...args: unknown[]) => Promise<unknown>> };
      new Function("require", "module", "exports", output.outputFiles[0].text)(createRequire(import.meta.url), exported, exported.exports);
      return exported.exports;
    }
    const api = await bundle("src/lib/booking-online-payment.ts");
    const confirmation = await bundle("src/lib/booking-payment-confirmation.ts");
    const org = randomUUID(), bank = randomUUID(), method = randomUUID();
    await pg.query("INSERT INTO financial_accounts(id,organization_id,is_active) VALUES($1,$2,true)", [bank, org]);
    await pg.query("INSERT INTO payment_methods(id,organization_id,kind,is_active,default_account_id,name) VALUES($1,$2,'link',true,$3,'Link')", [method, org, bank]);
    await assert.rejects(api.bookingOnlineProvider(org), /BOOKING_PROVIDER_NOT_CONFIGURED/);
    const integration = randomUUID();
    await pg.query("INSERT INTO organization_financial_integrations(id,organization_id,provider,status,environment,is_default_pos,metadata) VALUES($1,$2,'mercado_pago','active','sandbox',true,$3)", [integration, org, { webhookStatus: "configured" }]);
    assert.equal((await api.bookingOnlineProvider(org) as { provider: string }).provider, "mercado_pago");
    await pg.query("UPDATE organization_financial_integrations SET status='configured' WHERE id=$1", [integration]);
    await assert.rejects(api.bookingOnlineProvider(org), /BOOKING_PROVIDER_NOT_CONFIGURED/);
    let exampleId = "", appointmentId = "";
    for (const provider of ["asaas", "mercado_pago", "pagbank", "efi"]) {
      await pg.query("DELETE FROM organization_financial_integrations");
      await pg.query("INSERT INTO organization_financial_integrations(id,organization_id,provider,status,environment,is_default_pos,metadata) VALUES($1,$2,$3,'active','sandbox',true,$4)", [randomUUID(), org, provider, {webhookStatus: ['asaas','efi'].includes(provider) ? 'active' : 'configured'}]);
      const id = randomUUID(), appointment = randomUUID(), entry = randomUUID();
      await pg.query("INSERT INTO appointments(id,organization_id,status,deposit_status,reservation_expires_at,metadata) VALUES($1,$2,'scheduled','pending',$3,'{}')", [appointment, org, new Date(Date.now() + 600000)]);
      await pg.query("INSERT INTO financial_entries(id,organization_id,status,amount_in_cents) VALUES($1,$2,'pending',2500)", [entry, org]);
      await pg.query("INSERT INTO payment_charges(id,organization_id,provider,origin_type,origin_id,financial_entry_id,status,amount_in_cents,description,customer_name,customer_document,due_date,metadata) VALUES($1,$2,$3,'appointment',$4,$5,'payment_review',2500,'Sinal','Fictício','00000000000','2026-11-12',$6)", [id, org, provider, appointment, entry, { issuanceState: "new", expiresAt: new Date(Date.now() + 600000).toISOString(), environment: "sandbox" }]);
      await Promise.all([api.issueBookingOnlinePayment(id, "fake-token"), api.issueBookingOnlinePayment(id, "fake-token")]);
      const row = (await pg.query<{ status: string; invoice_url: string; pix_qr_code_payload: string }>("SELECT * FROM payment_charges WHERE id=$1", [id])).rows[0];
      assert.equal(row.status, "pending"); assert.ok(provider === "efi" ? row.pix_qr_code_payload : row.invoice_url);
      if (provider === "mercado_pago") { exampleId = id; appointmentId = appointment; }
    }
    assert.equal(scope.onlineCalls.filter(call => call.path === "/checkout/preferences").length, 1);
    assert.equal(scope.onlineCalls.filter(call => call.path === "/payments").length, 1);
    const mpBody = scope.onlineCalls.find(call => call.path === "/checkout/preferences")!.options.body!;
    assert.equal(mpBody.payment_methods, undefined, "checkout offers the account's enabled methods");
    const panel = await bundle("src/components/booking-online-panel.tsx");
    const html = renderToStaticMarkup(await panel.BookingOnlinePanel({ chargeId: exampleId, status: "scheduled", timezone:"America/Bahia", expiresAt: new Date(Date.now() + 600000) }) as ReactElement);
    assert.match(html, /Mercado Pago/); assert.match(html, /Pagar sinal/); assert.match(html, /sandbox.mercadopago.com.br/);
    const expired = renderToStaticMarkup(await panel.BookingOnlinePanel({ chargeId: exampleId, status: "cancelled", timezone:"America/Bahia", expiresAt: null }) as ReactElement);
    assert.ok(!expired.includes("href="));
    const charge = (await (scope.onlineDb as ReturnType<typeof drizzle>).select().from(schema.paymentCharges).where((await import("drizzle-orm")).eq(schema.paymentCharges.id, exampleId)))[0];
    const input = { eventId: "synthetic-paid", status: "paid", amountInCents: 2500, paymentId: "verified", method: "credit_card" };
    await assert.rejects(confirmation.confirmBookingPayment(charge, { ...input, amountInCents: 2600 }), /AMOUNT_MISMATCH/);
    await confirmation.confirmBookingPayment(charge, input); await confirmation.confirmBookingPayment(charge, input);
    assert.equal(scope.onlineNotified, 1);
    // Exercise the public route, not only the provider adapter. A retry must reuse the reservation.
    await pg.query("UPDATE organization_financial_integrations SET provider='mercado_pago',metadata=$1", [{ webhookStatus: "configured" }]);
    await pg.query("INSERT INTO organizations(id,slug,name,booking_enabled,timezone,booking_horizon_days,slot_interval_minutes,booking_notice_hours,booking_payment_settings) VALUES($1,'online-test','Fictícia',true,'America/Bahia',60,30,0,$2)", [org, { mode: "integrated" }]);
    const service = randomUUID(), professional = randomUUID();
    await pg.query("INSERT INTO clients(id,organization_id,name,phone) VALUES($1,$2,'Fictício','71999999999')", [clientId, org]);
    await pg.query("INSERT INTO professionals(id,organization_id,name,is_active,is_bookable) VALUES($1,$2,'Fictício',true,true)", [professional, org]);
    await pg.query("INSERT INTO services(id,organization_id,name,duration_minutes,price_in_cents,deposit_type,deposit_value,deposit_expiration_minutes,public_repeat_policy,is_active) VALUES($1,$2,'Teste',60,10000,'percentage',30,30,'allow',true)", [service, org]);
    const booking = await bundle("src/app/api/public/booking/[slug]/appointments/route.ts");
    const bookingStartsAt = new Date(Date.now() + 86400000).toISOString();
    const request = () => new Request("https://example.invalid/api/test", { method: "POST", body: JSON.stringify({ serviceId: service, professionalId: professional, startsAt: bookingStartsAt, document: "00000000000" }) });
    const context = { params: Promise.resolve({ slug: "online-test" }) };
    const response = await booking.POST(request(), context) as Response;
    const created = await response.json(); assert.equal(response.status, 201, JSON.stringify(created)); assert.match(created.paymentUrl, /mercadopago/);
    const callsBeforeReplay = scope.onlineCalls.length;
    const replay = await booking.POST(request(), context) as Response;
    assert.equal(replay.status, 200); assert.equal((await replay.json()).id, created.id); assert.equal(scope.onlineCalls.length, callsBeforeReplay);
    assert.equal((await pg.query<{ status: string }>("SELECT status FROM appointments WHERE id=$1", [appointmentId])).rows[0].status, "confirmed");
    await pg.query("UPDATE appointments SET status='cancelled',deposit_status='pending' WHERE id=$1", [appointmentId]);
    await confirmation.confirmBookingPayment(charge, { ...input, eventId: "late-paid" });
    assert.equal((await pg.query<{ status: string }>("SELECT status FROM appointments WHERE id=$1", [appointmentId])).rows[0].status, "cancelled");
    assert.equal(scope.onlineNotified, 1);
  } finally { delete scope.onlineDb; delete scope.onlineCalls; delete scope.onlineNotified; delete scope.onlineFailure; await pg.close(); }
});
