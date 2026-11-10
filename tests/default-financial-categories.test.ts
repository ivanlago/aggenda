import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("default categories backfill existing organizations and seed new ones without overwriting choices", async () => {
  const pg = new PGlite();
  const existing = "00000000-0000-0000-0000-000000000001";
  const fresh = "00000000-0000-0000-0000-000000000002";
  try {
    await pg.exec(`
      CREATE TABLE organizations (id uuid PRIMARY KEY);
      CREATE TABLE financial_categories (
        organization_id uuid NOT NULL REFERENCES organizations(id),
        type text NOT NULL,
        name text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        UNIQUE (organization_id, type, name)
      );
    `);
    await pg.query("INSERT INTO organizations VALUES ($1)", [existing]);
    await pg.query("INSERT INTO financial_categories VALUES ($1, 'payable', 'DESPESAS FIXAS / ALUGUEL', false), ($1, 'receivable', 'Receita própria', true)", [existing]);
    await pg.exec(await readFile(new URL("../drizzle/0096_default_financial_categories.sql", import.meta.url), "utf8"));
    await pg.query("SELECT aggenda_seed_financial_categories($1)", [existing]);
    await pg.query("INSERT INTO organizations VALUES ($1)", [fresh]);

    const list = (org: string) => pg.query<{ type: string; name: string; is_active: boolean }>(
      "SELECT type, name, is_active FROM financial_categories WHERE organization_id = $1 ORDER BY type, name", [org],
    );
    const first = (await list(existing)).rows;
    const second = (await list(fresh)).rows;
    assert.equal(second.length, 43);
    assert.equal(first.length, 44);
    assert.deepEqual(first.find(({ name }) => name === "DESPESAS FIXAS / ALUGUEL"), { name: "DESPESAS FIXAS / ALUGUEL", type: "payable", is_active: false });
    assert.ok(first.some(({ name }) => name === "Receita própria"));
    assert.deepEqual(second.filter(({ type }) => type === "transfer").map(({ name }) => name), ["Transferência", "Transferência / Fechamento"]);
  } finally {
    await pg.close();
  }
});
