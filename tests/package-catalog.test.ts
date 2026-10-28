import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import type { db } from "../src/db";
import * as schema from "../src/db/schema";
import { packageAmount, packageSaleSelection, packageSituation, parsePackageTemplate } from "../src/lib/package-catalog";
import { registerPreviousPackage, savePackageTemplate } from "../src/lib/package-catalog-repository";

test("package input rejects invalid quantities and preserves cents", () => {
  assert.equal(packageAmount("1.234,56"), 123456);
  for (const amount of ["", "NaN", "-1", "0,001", "999999999999999"]) assert.throws(() => packageAmount(amount));
  const form = new FormData();
  form.set("name", "Pacote"); form.set("price", "499,00");
  assert.throws(() => parsePackageTemplate(form), /ao menos um/);
  const service = randomUUID();
  form.set(`quantity:${service}`, "2.5"); assert.throws(() => parsePackageTemplate(form));
  form.set(`quantity:${service}`, "2"); form.set("validityDays", "30.5"); assert.throws(() => parsePackageTemplate(form));
  form.set("validityDays", "30"); assert.equal(parsePackageTemplate(form).items[0].quantity, 2);
  form.append(`quantity:${service}`, "3"); assert.throws(() => parsePackageTemplate(form), /Não repita/);
});

test("package availability distinguishes reserved, consumed, expired and pending balances", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  const balance = [{ total: 6, used: 2, reserved: 1 }];
  assert.equal(packageSituation("active", null, balance, now).key, "active");
  assert.equal(packageSituation("active", new Date("2026-10-27"), balance, now).available, false);
  assert.equal(packageSituation("pending_payment", null, balance, now).available, false);
  assert.equal(packageSituation("cancelled", null, balance, now).available, false);
  assert.equal(packageSituation("active", null, [{ total: 6, used: 6, reserved: 0 }], now).key, "exhausted");
  assert.equal(packageSituation("active", null, [{ total: 6, used: 6, reserved: 2 }], now).key, "reserved");
});

test("package sales use only the current organization's available catalog", () => {
  const catalog = [{ id: "package:available", kind: "package", stock: 100 }];
  assert.equal(packageSaleSelection("available", catalog).cart[0].variantId, "package:available");
  assert.equal(packageSaleSelection("other-company", catalog).cart.length, 0);
  assert.ok(packageSaleSelection("inactive", catalog).error);
  assert.deepEqual(packageSaleSelection(undefined, catalog).cart, []);
});

test("package versions and previous acquisitions preserve conditions without creating revenue", async () => {
  const pg = new PGlite();
  const tables = { services: schema.services, clients: schema.clients, service_packages: schema.servicePackages, service_package_items: schema.servicePackageItems, client_packages: schema.clientPackages, client_package_balances: schema.clientPackageBalances, audit_logs: schema.auditLogs, financial_entries: schema.financialEntries, retail_sales: schema.retailSales, payment_charges: schema.paymentCharges };
  try {
    for (const [name, table] of Object.entries(tables)) {
      const columns = Object.values(getTableColumns(table)).map((column) => {
        const type = column.getSQLType();
        const fallback = column.primary && type === "uuid" ? " DEFAULT gen_random_uuid()" : ["created_at", "updated_at", "purchased_at"].includes(column.name) ? " DEFAULT now()" : typeof column.default === "boolean" || typeof column.default === "number" ? ` DEFAULT ${column.default}` : typeof column.default === "string" ? ` DEFAULT '${column.default.replaceAll("'", "''")}'` : "";
        return `"${column.name}" ${type}${column.primary ? " PRIMARY KEY" : ""}${fallback}`;
      });
      await pg.exec(`CREATE TABLE "${name}" (${columns.join(",")})`);
    }
    await pg.exec("CREATE UNIQUE INDEX balance_service ON client_package_balances(client_package_id,service_id)");
    const database = drizzle(pg, { schema }) as unknown as typeof db;
    const org = randomUUID(), outside = randomUUID(), service = randomUUID(), otherService = randomUUID(), client = randomUUID();
    await pg.query("INSERT INTO services(id,organization_id,name,is_active) VALUES ($1,$2,'Massagem',true),($3,$4,'Outro',true)", [service, org, otherService, outside]);
    await pg.query("INSERT INTO clients(id,organization_id,name) VALUES ($1,$2,'Cliente teste')", [client, org]);
    const original = await savePackageTemplate(database, org, { name: "Pacote original", description: "Original", priceInCents: 49900, validityDays: 30, items: [{ serviceId: service, quantity: 6 }] });
    const input = { registrationId: randomUUID(), clientId: client, packageId: original, purchasedAt: new Date("2026-09-01T15:00:00Z"), expiresAt: new Date("2026-10-01T02:59:59.999Z"), priceInCents: 45000, reason: "Migração do sistema anterior", remaining: [{ serviceId: service, quantity: 4 }] };
    const assigned = await registerPreviousPackage(database, org, "operator", input);
    assert.equal(await registerPreviousPackage(database, org, "operator", input), assigned, "Retry does not duplicate sessions");
    await assert.rejects(registerPreviousPackage(database, org, "operator", { ...input, remaining: [{ serviceId: service, quantity: 3 }] }), /já foi utilizado/);
    const replacement = await savePackageTemplate(database, org, { id: original, name: "Pacote novo", description: "Nova condição", priceInCents: 60000, validityDays: 90, items: [{ serviceId: service, quantity: 10 }] });
    assert.notEqual(replacement, original);
    assert.deepEqual((await pg.query("SELECT name,price_in_cents,validity_days,is_active FROM service_packages WHERE id=$1", [original])).rows[0], { name: "Pacote original", price_in_cents: 49900, validity_days: 30, is_active: false });
    assert.equal((await pg.query<{ quantity: number }>("SELECT quantity FROM service_package_items WHERE package_id=$1", [original])).rows[0].quantity, 6);
    assert.equal((await pg.query<{ package_id: string }>("SELECT package_id FROM client_packages WHERE id=$1", [assigned])).rows[0].package_id, original);
    assert.equal((await pg.query<{ total_quantity: number }>("SELECT total_quantity FROM client_package_balances WHERE client_package_id=$1", [assigned])).rows[0].total_quantity, 6);
    assert.equal((await pg.query<{ used_quantity: number }>("SELECT used_quantity FROM client_package_balances WHERE client_package_id=$1", [assigned])).rows[0].used_quantity, 2);
    await assert.rejects(savePackageTemplate(database, outside, { id: replacement, name: "Indevido", description: null, priceInCents: 100, validityDays: null, items: [{ serviceId: otherService, quantity: 1 }] }), /não está mais ativo/);
    await assert.rejects(registerPreviousPackage(database, outside, "operator", { ...input, registrationId: randomUUID() }), /não encontrado/);
    await assert.rejects(registerPreviousPackage(database, org, "operator", { ...input, registrationId: randomUUID(), remaining: [{ serviceId: service, quantity: 7 }] }), /sessões restantes/);
    await assert.rejects(savePackageTemplate(database, org, { name: "Inválido", description: null, priceInCents: 100, validityDays: null, items: [{ serviceId: otherService, quantity: 1 }] }), /procedimentos ativos/);
    for (const table of ["financial_entries", "retail_sales", "payment_charges"]) assert.equal((await pg.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count, 0);
    assert.equal((await pg.query<{ count: number }>("SELECT count(*)::int AS count FROM client_packages")).rows[0].count, 1);
    assert.equal((await pg.query<{ count: number }>("SELECT count(*)::int AS count FROM audit_logs WHERE action='import_previous'")).rows[0].count, 1);
  } finally { await pg.close(); }
});
