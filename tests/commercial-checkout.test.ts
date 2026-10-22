import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import type { db } from "../src/db";
import * as schema from "../src/db/schema";
import { addCalendarMonths, commercialQuote, extraQuote, pilotQuote } from "../src/lib/commercial-catalog";

test("approved commercial prices and calendar boundaries", () => {
  const selection = { product: "essential" as const, cycle: "monthly" as const, professionals: 1, signatures: false, nfse: "none" as const };
  for (const [professionals, amount] of [[1, 4990], [2, 6880], [3, 8770], [5, 10670], [10, 13420]]) assert.equal(commercialQuote({ ...selection, professionals }).amountInCents, amount);
  assert.equal(commercialQuote({ ...selection, cycle: "annual" }).amountInCents, 47880);
  assert.equal(commercialQuote({ ...selection, product: "complete" }).amountInCents, 24980);
  assert.equal(commercialQuote({ ...selection, product: "professional", cycle: "annual" }).amountInCents, 143784);
  assert.equal(commercialQuote({ ...selection, product: "complete", cycle: "annual" }).amountInCents, 239784);
  assert.equal(pilotQuote().amountInCents, 500);
  assert.equal(pilotQuote().months, 12);
  assert.equal(addCalendarMonths(new Date("2028-02-29T13:00:00Z"), 12).toISOString(), "2029-02-28T13:00:00.000Z");
  assert.throws(() => commercialQuote({ ...selection, professionals: 0 }));
});

test("real migration, payment deduplication, pilot quotas and prepaid extras in isolated Postgres", async () => {
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost/test";
  const { processCommercialPayment } = await import("../src/lib/commercial-payment");
  const { reserveCommercialUsage, usagePeriod } = await import("../src/lib/commercial-access");
  const { reserveAgentAiBudget, settleAgentAiBudget } = await import("../src/lib/commercial-ai-budget");
  const client = new PGlite();
  try {
    await client.exec(`CREATE TABLE organizations (id uuid PRIMARY KEY); CREATE TABLE users (id text PRIMARY KEY);
      CREATE TABLE professionals (id uuid PRIMARY KEY, organization_id uuid, is_active boolean);
      CREATE TABLE organization_subscriptions (organization_id uuid PRIMARY KEY, plan text NOT NULL DEFAULT 'trial', status text NOT NULL DEFAULT 'trialing',
        stripe_customer_id text, stripe_subscription_id text, stripe_price_id text, billing_provider text, billing_customer_id text, billing_subscription_id text,
        billing_checkout_id text, last_payment_id text, billing_plan_code text, billing_interval_months integer, billing_payment_method text, pending_period_months integer,
        trial_ends_at timestamp, current_period_end timestamp, cancel_at_period_end boolean DEFAULT false, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now());
      CREATE TABLE organization_service_plans (organization_id uuid PRIMARY KEY, core_plan_code text DEFAULT 'core', whatsapp_service_code text DEFAULT 'assisted',
        whatsapp_monthly_limit integer DEFAULT 0, ai_monthly_limit integer DEFAULT 0, nfse_service_code text DEFAULT 'none', nfse_monthly_limit integer DEFAULT 0,
        nfse_overage_in_cents integer DEFAULT 49, nfse_monthly_price_in_cents integer DEFAULT 4990, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now());
      CREATE TABLE organization_usage_counters (organization_id uuid, period_start date, metric text, quantity integer DEFAULT 0, updated_at timestamp DEFAULT now(), PRIMARY KEY (organization_id, period_start, metric));
      CREATE TABLE billing_webhook_events (id text PRIMARY KEY, provider text, type text, processed_at timestamp DEFAULT now());
      CREATE TABLE billing_payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, provider text, provider_payment_id text, plan_code text,
        payment_method text, amount_in_cents integer, status text, due_date timestamp, paid_at timestamp, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now(), UNIQUE(provider, provider_payment_id));`);
    await client.exec(await readFile(new URL("../drizzle/0081_commercial_checkout.sql", import.meta.url), "utf8"));
    const database = drizzle(client, { schema }) as unknown as typeof db;
    const org = randomUUID();
    await client.query("INSERT INTO organizations VALUES ($1)", [org]);
    await client.query("INSERT INTO users VALUES ('admin')");
    const [invite] = await database.insert(schema.pilotInvitations).values({ email: "pilot@example.test", tokenHash: "hash", createdBy: "admin", expiresAt: new Date(Date.now() + 86400000), organizationId: org }).returning();
    const [order] = await database.insert(schema.commercialOrders).values({ organizationId: org, invitationId: invite.id, quote: pilotQuote(), checkoutId: "checkout_pilot" }).returning();
    const payment = { id: "payment_pilot", value: 5, checkoutSession: "checkout_pilot", externalReference: `commercial:${order.id}` };
    await processCommercialPayment({ id: "event_checkout", event: "CHECKOUT_PAID", checkout: { id: "checkout_pilot", externalReference: `commercial:${order.id}` } }, database);
    const [first] = await database.select().from(schema.commercialContracts);
    assert.equal(first.kind, "pilot"); assert.equal(first.responseLimit, 1000); assert.equal(first.documentLimit, 30); assert.equal(first.noteLimit, 10);
    assert.equal(first.endsAt.toISOString(), addCalendarMonths(first.startedAt, 12).toISOString());
    await processCommercialPayment({ id: "event_payment", event: "PAYMENT_CONFIRMED", payment }, database);
    await processCommercialPayment({ id: "event_payment_2", event: "PAYMENT_RECEIVED", payment }, database);
    const [afterDuplicates] = await database.select().from(schema.commercialContracts);
    assert.equal(afterDuplicates.endsAt.toISOString(), first.endsAt.toISOString());
    const [subscription] = await database.select().from(schema.organizationSubscriptions);
    assert.equal(subscription.billingSubscriptionId, null); assert.equal(subscription.cancelAtPeriodEnd, true);
    assert.equal((await database.select().from(schema.billingPayments)).length, 1);
    const periodStart = usagePeriod(first.startedAt);
    const budget = await reserveAgentAiBudget(org, "gemini-3.1-flash-lite", 2000, 2048, database);
    assert.ok(budget);
    await settleAgentAiBudget(budget, 1000, 100, database);
    assert.equal((await database.select().from(schema.organizationUsageCounters))[0].quantity, 400);
    await database.update(schema.organizationUsageCounters).set({ quantity: 4_999_999 });
    await assert.rejects(reserveAgentAiBudget(org, "gemini-3.1-flash-lite", 2000, 2048, database), /Limite interno/);
    await database.insert(schema.commercialUsage).values(Array.from({ length: 29 }, (_, i) => ({ organizationId: org, metric: "documents", resourceId: `doc${i}`, periodStart })));
    const contenders = await Promise.allSettled(["last-doc", "racing-doc-1", "racing-doc-2"].map((id) => database.transaction((tx) => reserveCommercialUsage(tx, org, "documents", id))));
    assert.equal(contenders.filter((r) => r.status === "fulfilled").length, 1, "Only one concurrent request can use the final unit");
    await assert.rejects(database.transaction((tx) => reserveCommercialUsage(tx, org, "documents", "blocked-doc")));
    await database.transaction((tx) => reserveCommercialUsage(tx, org, "documents", "last-doc")); // Idempotent.
    const [extra] = await database.insert(schema.commercialOrders).values({ organizationId: org, quote: extraQuote("documents"), checkoutId: "checkout_extra" }).returning();
    await assert.rejects(processCommercialPayment({ id: "bad_amount", event: "PAYMENT_CONFIRMED", payment: { id: "bad", value: 1, externalReference: `commercial:${extra.id}` } }, database));
    await processCommercialPayment({ id: "extra_paid", event: "PAYMENT_CONFIRMED", payment: { id: "extra", value: 19.9, externalReference: `commercial:${extra.id}` } }, database);
    await database.transaction((tx) => reserveCommercialUsage(tx, org, "documents", "extra-doc"));
    assert.equal((await database.select().from(schema.commercialContracts))[0].endsAt.toISOString(), first.endsAt.toISOString());
    await processCommercialPayment({ id: "extra_reversed", event: "PAYMENT_REFUNDED", payment: { id: "extra", externalReference: `commercial:${extra.id}` } }, database);
    assert.equal((await database.select().from(schema.organizationSubscriptions))[0].status, "active");
    await assert.rejects(database.transaction((tx) => reserveCommercialUsage(tx, org, "documents", "after-refunded-credit")));
    // A subsequent monthly commercial customer: first payment, duplicate checkout,
    // subsequent recurring payment and delayed cancellation of the old contract.
    const org2 = randomUUID(); await client.query("INSERT INTO organizations VALUES ($1)", [org2]);
    await database.insert(schema.organizationSubscriptions).values({ organizationId: org2, status: "trialing", plan: "trial", trialEndsAt: new Date(Date.now() + 86400000) });
    const [monthly] = await database.insert(schema.commercialOrders).values({ organizationId: org2, quote: { ...commercialQuote({ product: "complete", cycle: "monthly", professionals: 1, signatures: false, nfse: "none" }), billing: { method: "CREDIT_CARD", recurring: true } }, checkoutId: "monthly_checkout" }).returning();
    const monthlyPayment = { id: "monthly_payment", value: 249.8, subscription: "monthly_subscription", externalReference: `commercial:${monthly.id}` };
    await processCommercialPayment({ id: "subscription_first", event: "SUBSCRIPTION_CREATED", subscription: { id: "monthly_subscription", externalReference: `commercial:${monthly.id}` } }, database);
    assert.equal((await database.select().from(schema.organizationSubscriptions).where(eq(schema.organizationSubscriptions.organizationId, org2)))[0].status, "trialing");
    await processCommercialPayment({ id: "monthly_first", event: "PAYMENT_CONFIRMED", payment: { ...monthlyPayment, externalReference: undefined } }, database);
    const [month1] = await database.select().from(schema.commercialContracts).where(eq(schema.commercialContracts.organizationId, org2));
    await processCommercialPayment({ id: "monthly_checkout_paid", event: "CHECKOUT_PAID", checkout: { id: "monthly_checkout" } }, database);
    assert.equal((await database.select().from(schema.commercialContracts).where(eq(schema.commercialContracts.organizationId, org2)))[0].endsAt.toISOString(), month1.endsAt.toISOString());
    await processCommercialPayment({ id: "monthly_second", event: "PAYMENT_RECEIVED", payment: { ...monthlyPayment, id: "monthly_payment_2" } }, database);
    assert.equal((await database.select().from(schema.commercialContracts).where(eq(schema.commercialContracts.organizationId, org2)))[0].endsAt.toISOString(), addCalendarMonths(month1.endsAt, 1).toISOString());
    assert.equal((await database.select().from(schema.organizationServicePlans).where(eq(schema.organizationServicePlans.organizationId, org2)))[0].whatsappServiceCode, "core_ai");
    assert.equal(usagePeriod(new Date("2026-01-31T14:00:00Z"), new Date("2026-03-30T14:00:00Z")), "2026-02-28");
    assert.equal(usagePeriod(new Date("2026-01-31T14:00:00Z"), new Date("2026-03-31T14:00:00Z")), "2026-03-31");
    await database.update(schema.commercialContracts).set({ endsAt: new Date(0) }).where(eq(schema.commercialContracts.organizationId, org));
    await assert.rejects(database.transaction((tx) => reserveCommercialUsage(tx, org, "responses", "expired")));
  } finally { await client.close(); }
});
