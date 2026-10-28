import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import type { db } from "../src/db";
import * as schema from "../src/db/schema";
import { loadChargeableEntries, loadChargeList } from "../src/lib/charge-list";

test("charge pages filter in SQL, preserve full totals and fetch only visible histories", async () => {
  const pg = new PGlite();
  try {
    for (const [name, table] of Object.entries({ payment_charges: schema.paymentCharges, payment_charge_events: schema.paymentChargeEvents, financial_entries: schema.financialEntries, clients: schema.clients })) {
      const columns = Object.values(getTableColumns(table)).map(column => `"${column.name}" ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}`);
      await pg.exec(`CREATE TABLE "${name}" (${columns.join(",")})`);
    }
    const database = drizzle(pg, { schema }) as unknown as typeof db;
    const org = randomUUID(), other = randomUUID();
    const ids = Array.from({ length: 45 }, () => randomUUID()).sort();
    for (const [index, id] of ids.entries()) {
      await pg.query("INSERT INTO payment_charges(id,organization_id,status,amount_in_cents,customer_name,description,customer_document,due_date,payment_method,created_at) VALUES ($1,$2,$3,$4,'São João',$5,'123456','2026-10-10','pix','2026-10-01')", [id, org, index < 25 ? "paid" : "pending", 1000, index === 0 ? "100%_literal" : "Consulta"]);
      await pg.query("INSERT INTO payment_charge_events(id,organization_id,charge_id,event_type,status,created_at) VALUES ($1,$2,$3,'PAYMENT_RECEIVED','paid','2026-10-01')", [randomUUID(), org, id]);
    }
    const outsideCharge = randomUUID();
    await pg.query("INSERT INTO payment_charges(id,organization_id,status,amount_in_cents,customer_name,description,due_date,payment_method,created_at) VALUES ($1,$2,'paid',999999,'Outro','Segredo','2026-10-10','pix','2026-10-01')", [outsideCharge, other]);
    await pg.query("INSERT INTO payment_charge_events(id,organization_id,charge_id,event_type,status,created_at) VALUES ($1,$2,$3,'OUTSIDE','paid','2026-10-01')", [randomUUID(), other, ids[44]]);
    const first = await loadChargeList(database, org, {}, "2026-10-28");
    const second = await loadChargeList(database, org, { pagina: "2" }, "2026-10-28");
    assert.equal(first.charges.length, 20);
    assert.equal(first.pages, 3);
    assert.equal(first.totals.count, 45);
    assert.equal(first.totals.paidAmount, 25000);
    assert.equal(first.totals.overdueAmount, 20000);
    assert.deepEqual(first.totals, second.totals);
    assert.equal(new Set([...first.charges, ...second.charges].map(row => row.id)).size, 40, "Stable ID tiebreaker avoids duplicate rows");
    assert.equal(first.events.length, 20);
    assert.ok(first.events.every(event => first.charges.some(charge => charge.id === event.chargeId)));
    assert.ok(first.events.every(event => event.eventType !== "OUTSIDE"));
    const last = await loadChargeList(database, org, { pagina: "99999999999" }, "2026-10-28");
    assert.equal(last.currentPage, 3); assert.equal(last.charges.length, 5);
    for (const pagina of ["NaN", "Infinity", "-1", "0", "1.8"]) assert.equal((await loadChargeList(database, org, { pagina }, "2026-10-28")).currentPage, 1);
    const paid = await loadChargeList(database, org, { status: "paid" }, "2026-10-28");
    assert.equal(paid.totals.count, 25); assert.equal(paid.totals.openCount, 0);
    assert.equal((await loadChargeList(database, org, { status: "pending" }, "2026-10-28")).totals.count, 0);
    assert.equal((await loadChargeList(database, org, { status: "overdue" }, "2026-10-28")).totals.count, 20);
    assert.equal((await loadChargeList(database, org, { busca: "sÃO joÃO", meio: "pix", inicio: "2026-10-10", fim: "2026-10-10" }, "2026-10-28")).totals.count, 45);
    assert.equal((await loadChargeList(database, org, { busca: "%_" }, "2026-10-28")).totals.count, 1, "Search wildcards remain literal");
    for (const filters of [{ cobranca: outsideCharge }, { cobranca: "invalid" }, { inicio: "2026-02-30" }, { meio: "boleto" }, { fim: "2026-10-09" }]) {
      const empty = await loadChargeList(database, org, filters, "2026-10-28");
      assert.equal(empty.charges.length, 0); assert.equal(empty.events.length, 0); assert.equal(empty.totals.count, 0);
    }

    const entryIds = Array.from({ length: 9 }, () => randomUUID());
    for (const id of entryIds) await pg.query("INSERT INTO financial_entries(id,organization_id,type,status,source,description,due_date,amount_in_cents) VALUES ($1,$2,'receivable','pending','manual','Conta','2026-11-01',1000)", [id, org]);
    for (const [index, status] of ["pending", "overdue", "paid", "payment_review", "partially_refunded", "cancelled", "refunded"].entries()) await pg.query("INSERT INTO payment_charges(id,organization_id,financial_entry_id,status,created_at) VALUES ($1,$2,$3,$4,'2026-10-01')", [randomUUID(), org, entryIds[index], status]);
    await pg.query("UPDATE financial_entries SET source='retail_sale' WHERE id=$1", [entryIds[7]]);
    await pg.query("INSERT INTO payment_charges(id,organization_id,financial_entry_id,status) VALUES ($1,$2,$3,'pending')", [randomUUID(), other, entryIds[8]]);
    const eligible = await loadChargeableEntries(database, org);
    assert.deepEqual(new Set(eligible.map(entry => entry.id)), new Set([entryIds[5], entryIds[6], entryIds[8]]), "Eligibility checks every managed charge, independently of current page and filters");
  } finally { await pg.close(); }
});
