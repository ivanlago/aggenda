import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { build } from "esbuild";
import { financialEntries, paymentCharges } from "../src/db/schema";
import { financialDueDate } from "../src/lib/financial-schedule";

test("monthly due dates keep the requested day when possible", () => {
  assert.equal(financialDueDate("2027-01-31", 1), "2027-02-28");
  assert.equal(financialDueDate("2027-01-31", 2), "2027-03-31");
  assert.equal(financialDueDate("2028-01-31", 1), "2028-02-29");
});

test("provider rejection can be retried, but ambiguous issuance blocks duplicates", async () => {
  const pg = new PGlite();
  const globals = globalThis as typeof globalThis & { chargeTestDb?: ReturnType<typeof drizzle> };
  try {
    for (const [name, table] of Object.entries({ financial_entries: financialEntries, payment_charges: paymentCharges })) {
      const columns = Object.values(getTableColumns(table)).map(column =>
        `"${column.name}" ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}`,
      );
      await pg.exec(`CREATE TABLE ${name} (${columns.join(",")})`);
    }
    globals.chargeTestDb = drizzle(pg);
    const bundle = await build({
      stdin: { contents: 'export * from "./src/lib/financial-charge-issuance"; export * from "./src/lib/provider-request-error";', resolveDir: process.cwd() },
      bundle: true, write: false, format: "cjs", platform: "node", packages: "external",
      plugins: [{ name: "charge-db", setup(builder) {
        builder.onResolve({ filter: /^@\/db$/ }, ({ path }) => ({ path, namespace: "fixture" }));
        builder.onLoad({ filter: /./, namespace: "fixture" }, () => ({ contents: "export const db = globalThis.chargeTestDb;" }));
      } }],
    });
    const fixture = { exports: {} as typeof import("../src/lib/financial-charge-issuance") & typeof import("../src/lib/provider-request-error") };
    new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), fixture, fixture.exports);
    const { reserveFinancialCharge, failFinancialCharge, ProviderRequestError } = fixture.exports;
    const entry = randomUUID(), organizationId = randomUUID();
    await pg.query("INSERT INTO financial_entries(id,organization_id,type,status) VALUES ($1,$2,'receivable','pending')", [entry, organizationId]);
    const charge = { id: randomUUID(), organizationId, financialEntryId: entry, provider: "asaas", originType: "financial", originId: entry,
      amountInCents: 10000, description: "Parcela 1", dueDate: "2026-12-10", paymentMethod: "pix", customerName: "Pagador teste" };
    const payment = { accountId: randomUUID(), paymentMethodId: randomUUID(), paymentMethodName: "Pix", method: "pix" };
    assert.equal(await reserveFinancialCharge(charge, payment), null);
    assert.equal((await reserveFinancialCharge({ ...charge, id: randomUUID() }, payment))?.chargeId, charge.id);
    const rejected = await failFinancialCharge(charge.id, new ProviderRequestError("Dados inválidos", 422));
    assert.equal("chargeId" in rejected, false);
    const second = { ...charge, id: randomUUID() };
    assert.equal(await reserveFinancialCharge(second, payment), null);
    const ambiguous = await failFinancialCharge(second.id, new Error("timeout"));
    assert.equal(ambiguous.chargeId, second.id);
    assert.equal((await reserveFinancialCharge({ ...charge, id: randomUUID() }, payment))?.chargeId, second.id);
    const [row] = (await pg.query("SELECT status,amount_in_cents FROM payment_charges WHERE id=$1", [second.id])).rows;
    assert.deepEqual(row, { status: "payment_review", amount_in_cents: 10000 });
  } finally {
    delete globals.chargeTestDb;
    await pg.close();
  }
});
