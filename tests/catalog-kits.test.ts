import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { kitInputSchema } from "../src/lib/catalog-kit-input";

const orgId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const input = { name: "Kit completo", description: "", priceInCents: 12500, isActive: true, items: [{ type: "product", id: itemId, quantity: 2 }, { type: "service", id: orgId, quantity: 1 }] };

test("kit accepts products and services with whole quantities", () => {
  assert.equal(kitInputSchema.parse(input).items.length, 2);
  for (const quantity of [0, -1, 1.5, 10001, NaN]) {
    assert.equal(kitInputSchema.safeParse({ ...input, items: [{ ...input.items[0], quantity }] }).success, false);
  }
  for (const priceInCents of [-1, NaN, 1.5, 2147483648]) assert.equal(kitInputSchema.safeParse({ ...input, priceInCents }).success, false);
  assert.equal(kitInputSchema.safeParse({ ...input, items: [] }).success, false);
  assert.equal(kitInputSchema.safeParse({ ...input, items: [{ ...input.items[0], id: "invalid" }] }).success, false);
});

test("kit migration preserves existing records, persists composition, and enforces tenant and price constraints", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE organizations (id uuid PRIMARY KEY, name text NOT NULL); INSERT INTO organizations VALUES ('${orgId}', 'Catálogo existente'); CREATE TABLE services (id uuid PRIMARY KEY, name text); INSERT INTO services VALUES ('${itemId}', 'Serviço existente');`);
    await db.exec(await readFile(new URL("../drizzle/0092_catalog_kits.sql", import.meta.url), "utf8"));
    const { rows: [kit] } = await db.query<{ id: string; items: typeof input.items }>("INSERT INTO catalog_kits (organization_id, name, price_in_cents, items) VALUES ($1, $2, $3, $4) RETURNING id, items", [orgId, input.name, input.priceInCents, JSON.stringify(input.items)]);
    assert.deepEqual(kit.items, input.items);
    assert.deepEqual((await db.query("SELECT name FROM services")).rows, [{ name: "Serviço existente" }]);
    assert.deepEqual((await db.query("SELECT name FROM organizations")).rows, [{ name: "Catálogo existente" }]);
    await assert.rejects(db.query("INSERT INTO catalog_kits (organization_id, name, price_in_cents, items) VALUES ($1, 'Inválido', -1, '[]')", [orgId]));
    await assert.rejects(db.query("INSERT INTO catalog_kits (organization_id, name, price_in_cents, items) VALUES ($1, 'Outra empresa', 0, '[]')", [itemId]));
    await db.query("UPDATE catalog_kits SET is_active = false WHERE id = $1", [kit.id]);
    assert.equal((await db.query<{ is_active: boolean }>("SELECT is_active FROM catalog_kits WHERE id = $1", [kit.id])).rows[0].is_active, false);
  } finally { await db.close(); }
});
