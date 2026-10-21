import assert from "node:assert/strict";
import test from "node:test";
import { createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "../src/db/schema";

test("migration and actual CRM actions preserve history and count only unresolved AI handoffs", async () => {
  const pg = new PGlite();
  const key = `conversationTest${randomUUID().replaceAll("-", "")}`;
  const context = { db: drizzle(pg), organizationId: randomUUID(), userId: "operator", role: "owner" };
  Object.assign(globalThis, { [key]: context });
  const previousSecret = process.env.META_WHATSAPP_APP_SECRET;
  const previousKey = process.env.AGGENDA_INTERNAL_API_KEY;
  try {
    for (const [name, table] of Object.entries({ services: schema.services, service_categories: schema.serviceCategories, retail_products: schema.retailProducts, retail_product_variants: schema.retailProductVariants, inventory_products: schema.inventoryProducts, inventory_lots: schema.inventoryLots, chat_conversations: schema.chatConversations, chat_messages: schema.chatMessages, organization_members: schema.organizationMembers, audit_logs: schema.auditLogs, organizations: schema.organizations, whatsapp_channels: schema.whatsappChannels, organization_service_plans: schema.organizationServicePlans, organization_usage_counters: schema.organizationUsageCounters, outbox_events: schema.outboxEvents })) {
      const columns = Object.values(getTableColumns(table)).filter(column => column.name !== "needs_human_attention").map(column => {
        const type = column.enumValues ? "text" : column.getSQLType();
        const fallback = column.primary && type === "uuid" ? " DEFAULT gen_random_uuid()" : ["created_at", "updated_at", "last_message_at"].includes(column.name) ? " DEFAULT now()" : typeof column.default === "string" ? ` DEFAULT '${column.default.replaceAll("'", "''")}'` : typeof column.default === "boolean" ? ` DEFAULT ${column.default}` : "";
        return `"${column.name}" ${type}${column.primary ? " PRIMARY KEY" : ""}${fallback}`;
      });
      await pg.exec(`CREATE TABLE "${name}" (${columns.join(",")})`);
    }
    await pg.exec("CREATE UNIQUE INDEX conversation_contact ON chat_conversations(channel_id,external_contact_id); CREATE UNIQUE INDEX message_external ON chat_messages(external_message_id); CREATE UNIQUE INDEX usage_unique ON organization_usage_counters(organization_id,period_start,metric); CREATE UNIQUE INDEX outbox_unique ON outbox_events(event_key)");
    const ai = randomUUID(), bot = randomUUID(), manual = randomUUID(), resolved = randomUUID(), outside = randomUUID();
    for (const [id, org, status, reason] of [[ai, context.organizationId, "requested", "IA: support"], [bot, context.organizationId, "bot", null], [manual, context.organizationId, "human", "Recepção"], [resolved, context.organizationId, "resolved", "IA: support"], [outside, randomUUID(), "requested", "IA: support"]]) {
      await pg.query("INSERT INTO chat_conversations(id,organization_id,handoff_status,handoff_reason) VALUES ($1,$2,$3,$4)", [id, org, status, reason]);
    }
    await pg.exec(await readFile("drizzle/0077_conversation_attention.sql", "utf8"));
    await pg.query("INSERT INTO chat_messages(id,conversation_id,body) VALUES ($1,$2,$3)", [randomUUID(), ai, "Historical message"]);
    async function load(entry: string) {
      const mocks: Record<string, string> = {
        "@/db": `export const db=globalThis.${key}.db;`,
        "@/lib/session": `export async function requireOrganization(){const c=globalThis.${key};return {session:{user:{id:c.userId}},organization:{id:c.organizationId,role:c.role}}}`,
        "@/lib/service-plans": "export async function getOrganizationServicePlan(){return {isLegacyFallback:false,whatsappServiceCode:'core_ai'}} export function isWhatsAppServiceCode(){return true} export const whatsappServices={core_ai:{workflowProduct:'CORE_AI'}};",
        "@/lib/outbox-trigger": "export async function triggerOutboxWorker(){}",
        "next/cache": "export function revalidatePath(){}",
      };
      const output = await build({ entryPoints: [entry], bundle: true, write: false, format: "cjs", platform: "node", packages: "external", plugins: [{ name: key, setup(builder) {
        builder.onResolve({ filter: /./ }, args => mocks[args.path] ? { path: args.path, namespace: key } : undefined);
        builder.onLoad({ filter: /./, namespace: key }, args => ({ contents: mocks[args.path], loader: "js" }));
      } }] });
      const exported = { exports: {} as Record<string, (...args: never[]) => Promise<unknown>> };
      new Function("require", "module", "exports", output.outputFiles[0].text)(createRequire(import.meta.url), exported, exported.exports);
      return exported.exports;
    }
    const actions = await load("src/actions/crm.ts");
    const header = await load("src/lib/header-data.ts");
    const count = () => (header.getOpenCommercialConversationCount as (org: string, role: string) => Promise<number>)(context.organizationId, "owner");
    const change = (id: string, status: string, assignedUserId?: string) => {
      const data = new FormData(); data.set("conversationId", id); data.set("status", status); data.set("reason", "Issue handled");
      if (assignedUserId) data.set("assignedUserId", assignedUserId);
      return (actions.updateCrmHandoff as (form: FormData) => Promise<unknown>)(data);
    };
    assert.equal(await count(), 1);
    await change(ai, "human"); assert.equal(await count(), 1);
    await assert.rejects(change(ai, "human", "outsider"), /não pertence/);
    await assert.rejects(change(outside, "resolved"), /não encontrada/);
    await change(ai, "resolved"); assert.equal(await count(), 0);
    assert.equal((await pg.query("SELECT body FROM chat_messages WHERE conversation_id=$1", [ai])).rows.length, 1);
    await change(ai, "bot"); assert.equal(await count(), 0);
    await change(bot, "human"); assert.equal(await count(), 0);
    assert.equal((await pg.query("SELECT * FROM audit_logs WHERE entity_id=$1", [ai])).rows.length, 3);
    context.role = "viewer";
    await assert.rejects(change(ai, "resolved"));
    context.role = "owner";
    // Exercise the real signed webhook and AI endpoint without contacting Meta or an AI provider.
    process.env.META_WHATSAPP_APP_SECRET = "isolated-webhook-test";
    process.env.AGGENDA_INTERNAL_API_KEY = "isolated-agent-test";
    const channel = randomUUID();
    await pg.query("INSERT INTO organizations(id,name,timezone) VALUES ($1,'Test clinic','America/Bahia')", [context.organizationId]);
    await pg.query("INSERT INTO whatsapp_channels(id,organization_id,phone_number_id,is_active) VALUES ($1,$2,'test-phone',true)", [channel, context.organizationId]);
    await pg.query("UPDATE chat_conversations SET channel_id=$1,external_contact_id='5511999999999' WHERE id=$2", [channel, ai]);
    const webhook = await load("src/app/api/webhooks/whatsapp/route.ts");
    const agent = await load("src/app/api/internal/ai/whatsapp/route.ts");
    const inbound = async (externalId: string, timestamp: number, selection?: { id: string; title: string }) => {
      const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "test-phone" }, messages: [{ id: externalId, from: "5511999999999", timestamp: String(timestamp), ...(selection ? { type: "interactive", interactive: { list_reply: selection } } : { type: "text", text: { body: "oi" } }) }] } }] }] });
      const signature = createHmac("sha256", process.env.META_WHATSAPP_APP_SECRET!).update(body).digest("hex");
      return (webhook.POST as (request: Request) => Promise<Response>)(new Request("http://localhost/api/webhooks/whatsapp", { method: "POST", body, headers: { "x-hub-signature-256": `sha256=${signature}` } }));
    };
    await change(ai, "resolved");
    const before = Math.floor(Date.now() / 1000) - 120;
    await inbound("delayed-old-message", before);
    assert.equal((await pg.query<{ handoff_status: string }>("SELECT handoff_status FROM chat_conversations WHERE id=$1", [ai])).rows[0].handoff_status, "resolved");
    const timestamp = Math.floor(Date.now() / 1000);
    await inbound("fresh-message", timestamp);
    assert.equal((await pg.query<{ handoff_status: string }>("SELECT handoff_status FROM chat_conversations WHERE id=$1", [ai])).rows[0].handoff_status, "bot");
    assert.equal(await count(), 0);
    const source = (await pg.query<{ id: string }>("SELECT id FROM chat_messages WHERE external_message_id='fresh-message'")).rows[0];
    const callAgent = () => (agent.POST as (request: Request) => Promise<Response>)(new Request("http://localhost/api/internal/ai/whatsapp", { method: "POST", headers: { authorization: "Bearer isolated-agent-test", "content-type": "application/json" }, body: JSON.stringify({ organizationId: context.organizationId, conversationId: ai, messageId: source.id, phoneNumberId: "test-phone", from: "5511999999999", text: "oi", whatsappServiceCode: "core_ai" }) }));
    assert.equal((await callAgent()).status, 200);
    assert.equal(await count(), 0);
    await change(ai, "resolved");
    await inbound("fresh-message", timestamp);
    assert.equal((await pg.query<{ handoff_status: string }>("SELECT handoff_status FROM chat_conversations WHERE id=$1", [ai])).rows[0].handoff_status, "resolved");
    // A queued, unanswered inbound message from the previous issue must not create another alert.
    await pg.query("DELETE FROM chat_messages WHERE external_message_id=$1", [`aggenda-ai:${source.id}`]);
    assert.equal((await (await callAgent()).json()).skipped, "resolved_issue");
    await inbound("interactive-selection", Math.floor(Date.now() / 1000) + 1, { id: "nav:products", title: "Produtos" });
    assert.equal((await pg.query<{ body: string }>("SELECT body FROM chat_messages WHERE external_message_id='interactive-selection'")).rows[0].body, "Produtos");
    assert.equal((await pg.query<{ payload: { text: string } }>("SELECT payload FROM outbox_events WHERE event_key='whatsapp:inbound:interactive-selection'")).rows[0].payload.text, "nav:products");

  } finally {
    if (previousSecret === undefined) delete process.env.META_WHATSAPP_APP_SECRET; else process.env.META_WHATSAPP_APP_SECRET = previousSecret;
    if (previousKey === undefined) delete process.env.AGGENDA_INTERNAL_API_KEY; else process.env.AGGENDA_INTERNAL_API_KEY = previousKey;
    Reflect.deleteProperty(globalThis, key);
    await pg.close();
  }
});
