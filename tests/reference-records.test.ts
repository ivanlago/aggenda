import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import type { db } from "../src/db";
import * as schema from "../src/db/schema";
import { changeReferenceRecord, saveReferenceRecord } from "../src/lib/reference-record-repository";

test("reference management preserves financial history and enforces organization boundaries", async () => {
  const pg = new PGlite();
  const tables = { financial_accounts: schema.financialAccounts, financial_categories: schema.financialCategories, financial_cost_centers: schema.financialCostCenters, financial_entries: schema.financialEntries, inventory_categories: schema.inventoryCategories, inventory_subcategories: schema.inventorySubcategories, retail_products: schema.retailProducts, service_categories: schema.serviceCategories, services: schema.services };
  try {
    for (const [name, table] of Object.entries(tables)) {
      const columns = Object.values(getTableColumns(table)).map((column) => {
        const type = column.getSQLType();
        const fallback = column.primary && type === "uuid" ? " DEFAULT gen_random_uuid()" : column.name === "created_at" || column.name === "updated_at" ? " DEFAULT now()" : typeof column.default === "boolean" || typeof column.default === "number" ? ` DEFAULT ${column.default}` : typeof column.default === "string" ? ` DEFAULT '${column.default.replaceAll("'", "''")}'` : "";
        return `"${column.name}" ${type}${column.primary ? " PRIMARY KEY" : ""}${fallback}`;
      });
      await pg.exec(`CREATE TABLE "${name}" (${columns.join(",")})`);
    }
    const database = drizzle(pg, { schema }) as unknown as typeof db;
    const org = randomUUID(), other = randomUUID();
    const category = await saveReferenceRecord(database, org, { kind: "financial_category", name: "Consultas", type: "receivable" });
    const account = await saveReferenceRecord(database, org, { kind: "financial_account", name: "Banco", accountType: "bank", openingBalanceInCents: 50000 });
    const center = await saveReferenceRecord(database, org, { kind: "cost_center", name: "Unidade Centro" });
    const entryId = randomUUID();
    await pg.query("INSERT INTO financial_entries(id, organization_id, category_id, category, account_id, cost_center_id, amount_in_cents, status) VALUES ($1,$2,$3,'Consultas',$4,$5,15000,'received')", [entryId, org, category.id, account.id, center.id]);
    await saveReferenceRecord(database, org, { kind: "financial_category", id: category.id, name: "Atendimentos", type: "payable" });
    assert.equal((await pg.query<{ category: string }>("SELECT category FROM financial_entries WHERE id=$1", [entryId])).rows[0].category, "Atendimentos");
    assert.equal((await pg.query<{ type: string }>("SELECT type FROM financial_categories WHERE id=$1", [category.id])).rows[0].type, "receivable", "Renaming cannot change the category type");
    await saveReferenceRecord(database, org, { kind: "financial_account", id: account.id, name: "Banco principal", accountType: "cash", openingBalanceInCents: 0 });
    assert.deepEqual((await pg.query("SELECT account_type,opening_balance_in_cents FROM financial_accounts WHERE id=$1", [account.id])).rows[0], { account_type: "bank", opening_balance_in_cents: 50000 });
    for (const [kind, record] of [["financial_account", account], ["financial_category", category], ["cost_center", center]] as const) {
      await changeReferenceRecord(database, org, kind, record.id, "deactivate");
      await assert.rejects(changeReferenceRecord(database, org, kind, record.id, "delete"), /preservar o histórico/);
      await changeReferenceRecord(database, org, kind, record.id, "activate");
    }
    assert.equal((await pg.query<{ amount_in_cents: number }>("SELECT amount_in_cents FROM financial_entries WHERE id=$1", [entryId])).rows[0].amount_in_cents, 15000);
    await assert.rejects(saveReferenceRecord(database, other, { kind: "financial_account", id: account.id, name: "Inválido" }), /não encontrado/);
    await assert.rejects(changeReferenceRecord(database, other, "financial_account", account.id, "deactivate"), /não encontrado/);

    const parent = await saveReferenceRecord(database, org, { kind: "product_category", name: "Cabelo" });
    await assert.rejects(saveReferenceRecord(database, other, { kind: "product_subcategory", name: "Shampoo", categoryId: parent.id }), /categoria válida/);
    const child = await saveReferenceRecord(database, org, { kind: "product_subcategory", name: "Shampoo", categoryId: parent.id });
    await assert.rejects(changeReferenceRecord(database, org, "product_category", parent.id, "delete"), /subcategorias/);
    const productId = randomUUID();
    await pg.query("INSERT INTO retail_products(id,organization_id,name,category_id,subcategory_id) VALUES ($1,$2,'Produto',$3,$4)", [productId, org, parent.id, child.id]);
    await assert.rejects(changeReferenceRecord(database, org, "product_subcategory", child.id, "delete"), /Reclassifique/);
    await saveReferenceRecord(database, org, { kind: "product_subcategory", id: child.id, name: "Shampoos", categoryId: randomUUID() });
    assert.equal((await pg.query<{ category_id: string | null }>("SELECT category_id FROM inventory_subcategories WHERE id=$1", [child.id])).rows[0].category_id, parent.id);
    await pg.query("UPDATE retail_products SET category_id=NULL,subcategory_id=NULL WHERE id=$1", [productId]);
    await changeReferenceRecord(database, org, "product_subcategory", child.id, "delete");
    await changeReferenceRecord(database, org, "product_category", parent.id, "delete");
    const serviceCategory = await saveReferenceRecord(database, org, { kind: "service_category", name: "Consultas" });
    const serviceId = randomUUID();
    await pg.query("INSERT INTO services(id,organization_id,name,category_id) VALUES ($1,$2,'Avaliação',$3)", [serviceId, org, serviceCategory.id]);
    await changeReferenceRecord(database, org, "service_category", serviceCategory.id, "delete");
    assert.equal((await pg.query<{ category_id: string | null }>("SELECT category_id FROM services WHERE id=$1", [serviceId])).rows[0].category_id, null);
  } finally { await pg.close(); }
});
