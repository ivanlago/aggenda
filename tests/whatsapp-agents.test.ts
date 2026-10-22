import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import * as schema from "../src/db/schema";

test("both real agent routes share navigation; Chat only links, Core books after confirmation; catalog and handoff stay tenant-scoped", async () => {
  const pg = new PGlite();
  const key = `agentTest${randomUUID().replaceAll("-", "")}`;
  const previous = process.env.AGGENDA_INTERNAL_API_KEY;
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  const tomorrow = new Date(); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1); tomorrow.setUTCHours(13, 0, 0, 0);
  const state = { db: drizzle(pg), slot: tomorrow.toISOString(), availableSlots: undefined as string[] | undefined, availabilityRequests: [] as { date: string; serviceId: string; professionalId: string; excludeAppointmentId?: string; timezone: string }[] };
  Object.assign(globalThis, { [key]: state });
  process.env.AGGENDA_INTERNAL_API_KEY = "isolated-agent-test";
  process.env.NEXT_PUBLIC_APP_URL = "https://aggenda.example";
  try {
    const tables = { organizations: schema.organizations, services: schema.services, service_categories: schema.serviceCategories, chat_conversations: schema.chatConversations, chat_messages: schema.chatMessages, outbox_events: schema.outboxEvents, organization_usage_counters: schema.organizationUsageCounters, retail_products: schema.retailProducts, retail_product_variants: schema.retailProductVariants, inventory_products: schema.inventoryProducts, inventory_lots: schema.inventoryLots, clients: schema.clients, professionals: schema.professionals, services_to_professionals: schema.servicesToProfessionals, appointments: schema.appointments, audit_logs: schema.auditLogs };
    for (const [name, table] of Object.entries(tables)) {
      const columns = Object.values(getTableColumns(table)).map(column => {
        const type = column.enumValues ? "text" : column.getSQLType();
        const fallback = column.primary && type === "uuid" ? " DEFAULT gen_random_uuid()" : ["created_at", "updated_at", "occurred_at", "last_message_at"].includes(column.name) ? " DEFAULT now()" : typeof column.default === "string" ? ` DEFAULT '${column.default.replaceAll("'", "''")}'` : typeof column.default === "boolean" ? ` DEFAULT ${column.default}` : typeof column.default === "number" ? ` DEFAULT ${column.default}` : "";
        return `"${column.name}" ${type}${column.primary ? " PRIMARY KEY" : ""}${fallback}`;
      });
      await pg.exec(`CREATE TABLE "${name}" (${columns.join(",")})`);
    }
    await pg.exec("CREATE UNIQUE INDEX message_external ON chat_messages(external_message_id); CREATE UNIQUE INDEX usage_unique ON organization_usage_counters(organization_id,period_start,metric); CREATE UNIQUE INDEX outbox_unique ON outbox_events(event_key); CREATE UNIQUE INDEX clients_phone ON clients(organization_id,phone)");
    const organization = randomUUID(), outside = randomUUID(), service = randomUUID(), professional = randomUUID(), client = randomUUID(), category = randomUUID(), product = randomUUID(), inventory = randomUUID(), variant = randomUUID();
    await pg.query("INSERT INTO organizations(id,name,slug,booking_enabled,public_address) VALUES ($1,'Clínica teste','clinica-teste',true,'Rua de teste, 10')", [organization]);
    await pg.query("INSERT INTO service_categories(id,organization_id,name) VALUES ($1,$2,'Consultas')", [category, organization]);
    await pg.query("INSERT INTO services(id,organization_id,name,category_id,duration_minutes,price_in_cents) VALUES ($1,$2,'Avaliação',$3,30,12000),($4,$5,'Segredo de outra empresa',null,30,999)", [service, organization, category, randomUUID(), outside]);
    await pg.query("INSERT INTO professionals(id,organization_id,name,is_active,is_bookable) VALUES ($1,$2,'Maria',true,true)", [professional, organization]);
    await pg.query("INSERT INTO services_to_professionals(service_id,professional_id,organization_id) VALUES ($1,$2,$3)", [service, professional, organization]);
    await pg.query("INSERT INTO clients(id,organization_id,name,phone) VALUES ($1,$2,'Cliente teste','71999999999')", [client, organization]);
    await pg.query("INSERT INTO retail_products(id,organization_id,name,brand) VALUES ($1,$2,'Creme','Marca Teste')", [product, organization]);
    await pg.query("INSERT INTO inventory_products(id,organization_id,name,current_quantity_millis) VALUES ($1,$2,'Creme estoque',5000)", [inventory, organization]);
    await pg.query("INSERT INTO retail_product_variants(id,organization_id,product_id,inventory_product_id,name,sale_price_in_cents) VALUES ($1,$2,$3,$4,'50 ml',5900)", [variant, organization, product, inventory]);
    async function load(path: string) {
      const mocks: Record<string, string> = {
        "@/db": `export const db=globalThis.${key}.db;`,
        "@/lib/outbox-trigger": "export async function triggerOutboxWorker(){}",
        "@/lib/finance": "export async function syncAppointmentFinancialEntry(){}",
        "@/lib/google-calendar": "export async function syncAppointmentToGoogleCalendar(){}; export async function deleteAppointmentFromGoogleCalendar(){}",
        "@/lib/package-balance": "export async function reconcilePackageUsage(){}",
        "@/lib/availability": `export async function getAvailableTimes(input){const state=globalThis.${key};state.availabilityRequests.push(input);return state.availableSlots ?? [state.slot]} export async function isTimeAvailable(){return true}`,
        "@/lib/ai/provider": "export async function generateAiJson(){throw new Error('No AI needed for menus')}" ,
      };
      const bundle = await build({ entryPoints: [path], bundle: true, write: false, format: "cjs", platform: "node", packages: "external", plugins: [{ name: key, setup(builder) {
        builder.onResolve({ filter: /./ }, args => mocks[args.path] ? { path: args.path, namespace: key } : undefined);
        builder.onLoad({ filter: /./, namespace: key }, args => ({ contents: mocks[args.path], loader: "js" }));
      } }] });
      const exported = { exports: {} as Record<string, (...args: unknown[]) => Promise<Response>> };
      new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), exported, exported.exports);
      return exported.exports;
    }
    const agent = await load("src/app/api/internal/ai/whatsapp/route.ts");
    const catalog = await load("src/app/api/public/whatsapp-catalog/[organizationId]/route.ts");
    const chat = randomUUID(), core = randomUUID();
    for (const id of [chat, core]) await pg.query("INSERT INTO chat_conversations(id,organization_id,channel_id,external_contact_id,client_id) VALUES ($1,$2,$3,'5571999999999',$4)", [id, organization, randomUUID(), client]);
    async function call(conversation: string, text: string, mode = "chat_ai") {
      const messageId = randomUUID();
      await pg.query("INSERT INTO chat_messages(id,organization_id,conversation_id,direction,body) VALUES ($1,$2,$3,'inbound',$4)", [messageId, organization, conversation, text]);
      const input = { organizationId: organization, conversationId: conversation, messageId, phoneNumberId: "test-phone", from: "5571999999999", text, whatsappServiceCode: mode };
      const request = () => new NextRequest("https://aggenda.example/api/internal/ai/whatsapp", { method: "POST", headers: { authorization: "Bearer isolated-agent-test", "content-type": "application/json" }, body: JSON.stringify(input) });
      const response = await agent.POST(request()); assert.equal(response.status, 200);
      const rows = await pg.query<{ body: string; raw_payload: { navigationState?: { options: { id: string; title: string }[] }; pendingAction?: { startsAt: string }; flowState?: { desiredDate?: string; offeredSlots?: string[] } } }>("SELECT body,raw_payload FROM chat_messages WHERE external_message_id=$1", [`aggenda-ai:${messageId}`]);
      return { output: rows.rows[0], messageId, replay: () => agent.POST(request()) };
    }
    const hello = await call(chat, "oi");
    assert.match(hello.output.body, /Como podemos ajudar/);
    assert.doesNotMatch(hello.output.body, /Segredo/);
    await call(chat, "1");
    const selected = await call(chat, "1");
    assert.match(selected.output.body, new RegExp(`servico=${service}`));
    assert.equal((await pg.query("SELECT * FROM appointments")).rows.length, 0);
    assert.match((await call(chat, "Quero cancelar meu agendamento")).output.body, /área do cliente/);
    await call(chat, "produtos");
    const document = (await pg.query<{ payload: { document?: { link: string } } }>("SELECT payload FROM outbox_events WHERE payload->>'conversationId'=$1 ORDER BY created_at DESC LIMIT 1", [chat])).rows[0].payload.document!;
    assert.ok(document.link);
    const pdf = await catalog.GET(new NextRequest(document.link), { params: Promise.resolve({ organizationId: organization }) });
    assert.equal(pdf.headers.get("content-type"), "application/pdf");
    assert.equal((await pdf.arrayBuffer()).byteLength > 500, true);
    const invalid = new URL(document.link); invalid.searchParams.set("signature", "0".repeat(64));
    assert.equal((await catalog.GET(new NextRequest(invalid), { params: Promise.resolve({ organizationId: organization }) })).status, 403);
    const other = await catalog.GET(new NextRequest(document.link), { params: Promise.resolve({ organizationId: outside }) });
    assert.equal(other.status, 403);
    const expired = new URL(document.link); expired.searchParams.set("expires", String(Date.now() - 1));
    assert.equal((await catalog.GET(new NextRequest(expired), { params: Promise.resolve({ organizationId: organization }) })).status, 403);
    const productDetails = await call(chat, "Creme");
    assert.match(productDetails.output.body, /Creme · 50 ml · Marca Teste/);
    await pg.query("UPDATE inventory_products SET current_quantity_millis=0 WHERE id=$1", [inventory]);
    const withoutStock = await call(chat, "menu");
    assert.ok(!withoutStock.output.raw_payload.navigationState!.options.some(option => option.id === "nav:products"));
    await pg.query("UPDATE inventory_products SET current_quantity_millis=5000 WHERE id=$1", [inventory]);
    await call(chat, "Pergunta fora do catálogo");
    assert.equal((await pg.query("SELECT * FROM clients")).rows.length, 1, "informational Chat does not create client records");
    await call(core, "oi", "core_ai"); await call(core, "1", "core_ai"); await call(core, "1", "core_ai");
    const book = await call(core, "1", "core_ai");
    assert.match(book.output.body, /Maria/);
    const prepare = await call(core, "Primeiro horário disponível", "core_ai");
    assert.ok(prepare.output.raw_payload.pendingAction);
    assert.match(prepare.output.body, /Preço:/);
    assert.equal((await pg.query("SELECT * FROM appointments")).rows.length, 0, "no appointment before confirmation");
    const confirm = await call(core, "CONFIRMAR", "core_ai");
    assert.match(confirm.output.body, /Agendamento realizado/);
    assert.equal((await pg.query("SELECT * FROM appointments")).rows.length, 1);
    assert.deepEqual(await (await confirm.replay()).json(), { accepted: true, duplicate: true });
    assert.equal((await pg.query("SELECT * FROM appointments")).rows.length, 1);
    await call(core, "Meus agendamentos", "core_ai");
    await call(core, "4", "core_ai");
    assert.equal((await pg.query<{ status: string }>("SELECT status FROM appointments")).rows[0].status, "confirmed");
    const extra = randomUUID();
    await pg.query("INSERT INTO appointments(id,organization_id,client_id,service_id,professional_id,starts_at,ends_at,status) VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled')", [extra, organization, client, service, professional, new Date(tomorrow.getTime() + 86400000), new Date(tomorrow.getTime() + 86400000 + 1800000)]);
    const choose = await call(core, "Quero confirmar presença", "core_ai");
    assert.match(choose.output.body, /Qual agendamento/);
    await call(core, "2", "core_ai");
    assert.equal((await pg.query<{ status: string }>("SELECT status FROM appointments WHERE id=$1", [extra])).rows[0].status, "confirmed");
    await call(core, "Quero reagendar", "core_ai");
    await call(core, "1", "core_ai");
    state.slot = new Date(tomorrow.getTime() + 3 * 86400000).toISOString();
    const newDate = new Date(state.slot).toLocaleDateString("pt-BR", { timeZone: "America/Bahia" });
    const originalAppointments = (await pg.query<{ id: string; starts_at: Date }>("SELECT id,starts_at FROM appointments ORDER BY id")).rows;
    const secondSlot = new Date(new Date(state.slot).getTime() + 3600000).toISOString();
    state.availableSlots = [state.slot, secondSlot];
    const availability = await call(core, `quais horários estão disponíveis no dia ${newDate}?`, "core_ai");
    assert.match(availability.output.body, /Horários disponíveis/);
    assert.match(availability.output.body, /1 - 10:00\n2 - 11:00/);
    assert.equal(availability.output.raw_payload.pendingAction, undefined);
    assert.deepEqual(availability.output.raw_payload.flowState?.offeredSlots, state.availableSlots);
    assert.deepEqual((await pg.query("SELECT id,starts_at FROM appointments ORDER BY id")).rows, originalAppointments, "asking for times never changes the existing reservation");
    const lastAvailabilityRequest = state.availabilityRequests.at(-1)!;
    assert.equal(lastAvailabilityRequest.serviceId, service);
    assert.equal(lastAvailabilityRequest.professionalId, professional);
    assert.equal(lastAvailabilityRequest.timezone, "America/Bahia");
    assert.ok(originalAppointments.some(item => item.id === lastAvailabilityRequest.excludeAppointmentId));
    assert.match((await call(core, "99", "core_ai")).output.body, /Escolha um dos números/);
    // A time that disappeared since the list must not be accepted by its old number.
    state.availableSlots = [state.slot];
    const lostSlot = await call(core, "2", "core_ai");
    assert.match(lostSlot.output.body, /Esse horário não está disponível/);
    assert.equal(lostSlot.output.raw_payload.pendingAction, undefined);
    state.availableSlots = [];
    assert.match((await call(core, `E no dia ${newDate}?`, "core_ai")).output.body, /Não há horários disponíveis/);
    assert.deepEqual((await pg.query("SELECT id,starts_at FROM appointments ORDER BY id")).rows, originalAppointments);
    state.availableSlots = [state.slot, secondSlot];
    await call(core, newDate, "core_ai");
    const numbered = await call(core, "1", "core_ai");
    assert.equal(numbered.output.raw_payload.pendingAction?.startsAt, state.slot);
    assert.deepEqual((await pg.query("SELECT id,starts_at FROM appointments ORDER BY id")).rows, originalAppointments, "selection still requires explicit confirmation");
    await call(core, "NÃO", "core_ai");
    await call(core, "Quero reagendar", "core_ai");
    await call(core, "1", "core_ai");
    await call(core, newDate, "core_ai");
    const desired = `${new Date(state.slot).toLocaleDateString("pt-BR", { timeZone: "America/Bahia" })} 10:00`;
    const reschedule = await call(core, desired, "core_ai");
    assert.ok(reschedule.output.raw_payload.pendingAction);
    await call(core, "CONFIRMAR", "core_ai");
    assert.equal((await pg.query("SELECT id FROM appointments WHERE starts_at=$1", [new Date(state.slot)])).rows.length, 1);
    state.availableSlots = undefined;
    const cancelChoices = await call(core, "Quero cancelar meu agendamento", "core_ai");
    assert.match(cancelChoices.output.body, /cancelar/, JSON.stringify(cancelChoices.output));
    const cancelPrepare = await call(core, "1", "core_ai");
    assert.ok(cancelPrepare.output.raw_payload.pendingAction, JSON.stringify({ cancelChoices: cancelChoices.output, cancelPrepare: cancelPrepare.output }));
    await call(core, "CONFIRMAR", "core_ai");
    assert.equal((await pg.query("SELECT id FROM appointments WHERE status='cancelled'")).rows.length, 1);
    await pg.query("UPDATE services SET deposit_type='fixed',deposit_value=5000 WHERE id=$1", [service]);
    await call(core, "menu", "core_ai"); await call(core, "1", "core_ai"); await call(core, "1", "core_ai"); await call(core, "1", "core_ai");
    const deposit = await call(core, "Primeiro horário disponível", "core_ai");
    assert.match(deposit.output.body, /exige sinal ou pagamento/);
    assert.match(deposit.output.body, new RegExp(`servico=${service}`));
    assert.equal(deposit.output.raw_payload.pendingAction, undefined);
    assert.equal((await pg.query("SELECT * FROM appointments")).rows.length, 2, "payment requirements never create an unpaid booking");
    await pg.query("UPDATE services SET deposit_type='none' WHERE id=$1", [service]);
    await call(core, "menu", "core_ai"); await call(core, "1", "core_ai"); await call(core, "1", "core_ai"); await call(core, "1", "core_ai");
    const expiring = await call(core, "Primeiro horário disponível", "core_ai");
    assert.ok(expiring.output.raw_payload.pendingAction);
    await pg.query("UPDATE chat_messages SET raw_payload=jsonb_set(raw_payload,'{pendingExpiresAt}',to_jsonb($1::text)) WHERE external_message_id=$2", [new Date(Date.now() - 1000).toISOString(), `aggenda-ai:${expiring.messageId}`]);
    assert.match((await call(core, "CONFIRMAR", "core_ai")).output.body, /expirou/);
    assert.equal((await pg.query("SELECT * FROM appointments")).rows.length, 2);
    await call(chat, "equipe");
    const handoff = (await pg.query<{ automation_paused: boolean; needs_human_attention: boolean }>("SELECT automation_paused,needs_human_attention FROM chat_conversations WHERE id=$1", [chat])).rows[0];
    assert.equal(handoff.automation_paused, true); assert.equal(handoff.needs_human_attention, true);
    const ambiguous = randomUUID();
    await pg.query("INSERT INTO clients(id,organization_id,name,phone) VALUES ($1,$2,'Outro cliente','11999999999')", [randomUUID(), organization]);
    await pg.query("INSERT INTO chat_conversations(id,organization_id,channel_id,external_contact_id) VALUES ($1,$2,$3,'5571999999999')", [ambiguous, organization, randomUUID()]);
    const identity = await call(ambiguous, "Meus próximos agendamentos", "core_ai");
    assert.match(identity.output.body, /identificar seu cadastro com segurança/);
    assert.doesNotMatch(identity.output.body, /Maria|Avaliação/);
  } finally {
    if (previous === undefined) delete process.env.AGGENDA_INTERNAL_API_KEY; else process.env.AGGENDA_INTERNAL_API_KEY = previous;
    if (origin === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = origin;
    Reflect.deleteProperty(globalThis, key); await pg.close();
  }
});
