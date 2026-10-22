import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { and, eq, getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import type { db } from "../src/db";
import * as schema from "../src/db/schema";
import { ClinicalRepository } from "../src/lib/clinical-repository";
import { allocateLots, restoreLots, stockMillis, validLotDate } from "../src/lib/inventory-lots";

test("lot quantities and dates reject rounding, overflow and impossible dates", () => {
  assert.equal(stockMillis("1,125"), 1125);
  for (const value of ["0", "-1", "1.0001", "Infinity", "1e3", "2147484"]) assert.throws(() => stockMillis(value));
  assert.equal(validLotDate("2026-02-30"), false);
  assert.equal(validLotDate("2028-02-29"), true);
});

test("real migration, lot actions, clinical use, FEFO, expiry blocking, reversal and recall on isolated PostgreSQL", async () => {
  const pg = new PGlite();
  const database = drizzle(pg, { schema }) as unknown as typeof db;
  const key = `lotsTest${randomUUID().replaceAll("-", "")}`;
  const org = randomUUID(), outside = randomUUID(), client = randomUUID(), appointment = randomUUID(), product = randomUUID(), service = randomUUID();
  const context = { db: database, organizationId: org, userId: "owner", role: "owner" };
  Object.assign(globalThis, { [key]: context });
  try {
    const tables = { organizations: schema.organizations, users: schema.users, clients: schema.clients, appointments: schema.appointments, inventory_products: schema.inventoryProducts, inventory_movements: schema.inventoryMovements, clinical_consultation_records: schema.clinicalConsultationRecords, audit_logs: schema.auditLogs, retail_sales: schema.retailSales, retail_sale_items: schema.retailSaleItems, retail_product_variants: schema.retailProductVariants, retail_products: schema.retailProducts, services: schema.services, financial_entries: schema.financialEntries, package_usages: schema.packageUsages, attendance_package_items: schema.attendancePackageItems, client_package_balances: schema.clientPackageBalances, client_packages: schema.clientPackages, service_inventory_items: schema.serviceInventoryItems, appointment_inventory_consumptions: schema.appointmentInventoryConsumptions, procedure_returns: schema.procedureReturns };
    for (const [name, table] of Object.entries(tables)) {
      const columns = Object.values(getTableColumns(table)).filter(column => column.name !== "lot_tracking").map(column => {
        const type = column.enumValues ? "text" : column.getSQLType();
        const fallback = column.primary && type === "uuid" ? " DEFAULT gen_random_uuid()" : ["created_at", "updated_at", "last_message_at", "sold_at", "consumed_at"].includes(column.name) ? " DEFAULT now()" : typeof column.default === "string" ? ` DEFAULT '${column.default.replaceAll("'", "''")}'` : typeof column.default === "boolean" || typeof column.default === "number" ? ` DEFAULT ${column.default}` : "";
        return `"${column.name}" ${type}${column.primary ? " PRIMARY KEY" : ""}${fallback}`;
      });
      await pg.exec(`CREATE TABLE "${name}" (${columns.join(",")})`);
    }
    await pg.exec("CREATE UNIQUE INDEX record_request ON clinical_consultation_records(organization_id,request_key); CREATE UNIQUE INDEX consumed_unique ON appointment_inventory_consumptions(appointment_id,product_id); CREATE UNIQUE INDEX return_unique ON procedure_returns(appointment_id,service_id)");
    await pg.query("INSERT INTO organizations(id,name,timezone) VALUES ($1,'Test clinic','America/Bahia'),($2,'Other clinic','America/Bahia')", [org, outside]);
    await pg.exec("INSERT INTO users(id,name) VALUES ('owner','Operator')");
    await pg.query("INSERT INTO clients(id,organization_id,name) VALUES ($1,$2,'Test patient')", [client, org]);
    await pg.query("INSERT INTO inventory_products(id,organization_id,name,unit,current_quantity_millis,consumption_quantity_millis) VALUES ($1,$2,'Serum','mL',5000,2000)", [product, org]);
    await pg.exec(await readFile("drizzle/0078_inventory_lot_control.sql", "utf8"));
    // Mixed stock: quarantine only blocks its own 20 units; regular lots and unassigned stock remain usable.
    const mixed = randomUUID();
    await database.insert(schema.inventoryProducts).values({ id: mixed, organizationId: org, name: "Mixed conditioner", currentQuantityMillis: 64000, consumptionQuantityMillis: 0 });
    const [blocked] = await database.insert(schema.inventoryLots).values({ organizationId: org, productId: mixed, code: "QUARANTINE", status: "quarantine", expiresOn: "2099-01-01", saleQuantityMillis: 20000 }).returning();
    const [regular] = await database.insert(schema.inventoryLots).values({ organizationId: org, productId: mixed, code: "REGULAR", status: "active", expiresOn: "2099-01-01", saleQuantityMillis: 10000 }).returning();
    const mixedReference = { organizationId: org, productId: mixed, referenceType: "sale" as const, referenceId: randomUUID(), userId: "owner" };
    await assert.rejects(database.transaction(tx => allocateLots(tx, { ...mixedReference, quantityMillis: 45000, pool: "sale" })), /insuficiente/);
    await assert.rejects(database.transaction(tx => allocateLots(tx, { ...mixedReference, quantityMillis: 1000, pool: "sale", lotId: blocked.id })), /indisponível/);
    await database.transaction(async tx => {
      const portions = await allocateLots(tx, { ...mixedReference, quantityMillis: 44000, pool: "sale" });
      assert.deepEqual(portions.map(p => [p.lotId, p.quantityMillis]), [[regular.id, 10000], [null, 34000]]);
      await tx.update(schema.inventoryProducts).set({ currentQuantityMillis: 20000 }).where(eq(schema.inventoryProducts.id, mixed));
    });
    await database.transaction(async tx => {
      const restored = await restoreLots(tx, { ...mixedReference, legacyQuantityMillis: 44000 });
      assert.deepEqual(restored, { sale: 44000, consumption: 0 });
      await tx.update(schema.inventoryProducts).set({ currentQuantityMillis: 64000 }).where(eq(schema.inventoryProducts.id, mixed));
    });
    assert.equal((await database.select().from(schema.inventoryLots).where(eq(schema.inventoryLots.id, blocked.id)))[0].saleQuantityMillis, 20000);
    const soap = randomUUID();
    await database.insert(schema.inventoryProducts).values({ id: soap, organizationId: org, name: "Mixed soap", currentQuantityMillis: 86000, consumptionQuantityMillis: 0 });
    await database.insert(schema.inventoryLots).values([{ organizationId: org, productId: soap, code: "EXPIRED", status: "active", expiresOn: "2000-01-01", saleQuantityMillis: 20000 }, { organizationId: org, productId: soap, code: "RECALLED", status: "recalled", expiresOn: "2099-01-01", saleQuantityMillis: 20000 }]);
    await database.transaction(async tx => {
      const portions = await allocateLots(tx, { ...mixedReference, productId: soap, quantityMillis: 46000, pool: "sale" });
      assert.deepEqual(portions.map(p => [p.lotId, p.quantityMillis]), [[null, 46000]]);
      throw new Error("Rollback availability check");
    }).catch(error => { assert.match(error.message, /Rollback availability check/); });
    const output = await build({ entryPoints: ["src/actions/inventory-lots.ts", "src/actions/inventory.ts", "src/lib/inventory.ts", "src/actions/retail.ts", "src/actions/stock-movement.ts", "src/lib/pos-catalog.ts"], outdir: "unused", bundle: true, write: false, format: "cjs", platform: "node", packages: "external", plugins: [{ name: key, setup(builder) {
      const mocks: Record<string, string> = { "@/db": `export const db=globalThis.${key}.db;`, "@/lib/session": `export async function requireOrganization(){const c=globalThis.${key};return {session:{user:{id:c.userId}},organization:{id:c.organizationId,role:c.role,timezone:'America/Bahia'}}} export async function requireProfessionalScope(){return 'unused'}`, "next/cache": "export function revalidatePath(){}" };
      builder.onResolve({ filter: /./ }, args => mocks[args.path] ? { path: args.path, namespace: key } : undefined);
      builder.onLoad({ filter: /./, namespace: key }, args => ({ contents: mocks[args.path], loader: "js" }));
    } }] });
    const modules = output.outputFiles.map(file => {
      const exported = { exports: {} as Record<string, (input: never) => Promise<unknown>> };
      new Function("require", "module", "exports", file.text)(createRequire(import.meta.url), exported, exported.exports);
      return exported.exports;
    });
    const actions = modules.find(module => module.registerInventoryLot)!;
    const old = modules.find(module => module.moveInventory)!;
    const inventory = modules.find(module => module.updateAppointmentAndInventory)!;
    const retail = modules.find(module => module.registerRetailSale)!;
    const movement = modules.find(module => module.saveInventoryMovement)!;
    const catalog = modules.find(module => module.getPosProducts)!;
    const unified = (fields: Record<string, string>) => {
      const form = new FormData(); for (const [name, value] of Object.entries({ productId: product, notes: "Unified stock movement", ...fields })) form.set(name, value);
      return (movement.saveInventoryMovement as (form: FormData) => Promise<unknown>)(form);
    };
    const call = (action: string, fields: Record<string, string>) => { const form = new FormData(); for (const [name, value] of Object.entries(fields)) form.set(name, value); return (actions[action] as (form: FormData) => Promise<unknown>)(form); };
    const register = (code: string, quantity: string, pool: string, expiresOn = "2098-01-01", mode = "existing") => call("registerInventoryLot", { productId: product, code, quantity, pool, expiresOn, mode });
    for (const id of [mixed, soap]) {
      const parent = randomUUID();
      await database.insert(schema.retailProducts).values({ id: parent, organizationId: org, name: id === mixed ? "Conditioner" : "Soap" });
      await database.insert(schema.retailProductVariants).values({ organizationId: org, productId: parent, inventoryProductId: id, name: "Default", isForSale: true, salePriceInCents: 1000 });
    }
    const availableProducts = await (catalog.getPosProducts as (id: string) => Promise<Array<{ stock: number }>>)(org);
    assert.deepEqual(availableProducts.map(p => p.stock), [44, 46]);
    // Manual operations without a selected lot may touch only the unassigned balance.
    await assert.rejects(unified({ productId: mixed, type: "exit", quantity: "35", pool: "sale" }), /Saldo sem lote insuficiente/);
    await unified({ productId: mixed, type: "consumption", quantity: "1" });
    await unified({ productId: mixed, type: "usage", quantity: "1" });
    assert.equal((await database.select().from(schema.inventoryProducts).where(eq(schema.inventoryProducts.id, mixed)))[0].currentQuantityMillis, 63000);
    assert.equal((await database.select().from(schema.inventoryLots).where(eq(schema.inventoryLots.id, blocked.id)))[0].saleQuantityMillis, 20000);
    await unified({ type: "entry", useLots: "on", mode: "existing", code: "EXPIRED", quantity: "2", pool: "sale", expiresOn: "2000-01-01" });
    await register("LATER", "3", "sale", "2099-01-01");
    await assert.rejects(call("activateInventoryLots", { productId: product }), /Distribua/);
    await register("FIRST", "2", "consumption");
    await call("activateInventoryLots", { productId: product });
    await register("FIRST", "1", "sale", "2098-01-01", "entry");
    await assert.rejects(register("FIRST", "1", "sale", "2097-01-01", "entry"), /validade/);
    const lots = await database.select().from(schema.inventoryLots).where(eq(schema.inventoryLots.productId, product));
    const first = lots.find(lot => lot.code === "FIRST")!, expired = lots.find(lot => lot.code === "EXPIRED")!;
    await assert.rejects(unified({ type: "usage", quantity: "1", useLots: "off" }), /Selecione o lote/);
    await assert.rejects(unified({ type: "usage", quantity: "1", lotId: expired.id }), /Lote indisponível/);
    await assert.rejects(unified({ type: "entry", quantity: "1", lotId: randomUUID(), pool: "sale" }), /não pertence/);
    await unified({ type: "consumption", quantity: "0.25", lotId: first.id });
    await unified({ type: "usage", quantity: "0.25", lotId: first.id });
    await unified({ type: "entry", quantity: "0.25", lotId: first.id, pool: "sale", code: "IGNORED-CLIENT-CODE", expiresOn: "2000-01-01" });
    context.organizationId = outside;
    await assert.rejects(register("OUTSIDE", "1", "sale", "2099-01-01", "entry"), /não encontrado/);
    context.organizationId = org;
    const oldForm = new FormData(); oldForm.set("productId", product); oldForm.set("type", "entry"); oldForm.set("quantity", "1"); oldForm.set("notes", "Legacy movement");
    // Add the variant used by the original stock action.
    await pg.query("INSERT INTO retail_product_variants(id,organization_id,inventory_product_id,is_for_sale) VALUES ($1,$2,$3,true)", [randomUUID(), org, product]);
    await assert.rejects((old.moveInventory as (form: FormData) => Promise<unknown>)(oldForm), /controle por lote/);
    await pg.query("INSERT INTO services(id,organization_id,name,price_in_cents,return_interval_unit) VALUES ($1,$2,'Procedure',0,'days')", [service, org]);
    await pg.query("INSERT INTO appointments(id,organization_id,client_id,service_id,status,starts_at,price_in_cents,metadata) VALUES ($1,$2,$3,$4,'scheduled',now(),0,'{}')", [appointment, org, client, service]);
    await pg.query("INSERT INTO service_inventory_items(organization_id,service_id,product_id,quantity_millis) VALUES ($1,$2,$3,1500)", [org, service, product]);
    const repository = new ClinicalRepository(database);
    const request = { organizationId: org, clientId: client, appointmentId: appointment, userId: "owner", requestKey: randomUUID(), data: { mode: "aesthetic" as const, subjective: "Objective", objective: "", assessment: "Assessment", plan: "Plan", procedure: "", intercurrences: "", instructions: "", followUpDate: "", vitals: {}, applications: [{ lotId: first.id, product: "Serum", lot: first.code, expiresOn: first.expiresOn!, quantity: 1, unit: "mL" as const, region: "Region" }] } };
    const record = await repository.record(request);
    assert.equal((await repository.record(request)).id, record.id);
    assert.equal((await database.select().from(schema.inventoryProducts).where(eq(schema.inventoryProducts.id, product)))[0].consumptionQuantityMillis, 1000);
    await assert.rejects(repository.record({ ...request, requestKey: randomUUID(), data: { ...request.data, applications: [{ ...request.data.applications[0], lotId: expired.id, lot: expired.code, expiresOn: expired.expiresOn! }] } }), /Lote indisponível/);
    const finish = (status: string) => (inventory.updateAppointmentAndInventory as (input: object) => Promise<unknown>)({ organizationId: org, appointmentId: appointment, userId: "owner", status, cancellationReason: null });
    await finish("completed"); await finish("completed");
    let stock = (await database.select().from(schema.inventoryProducts).where(eq(schema.inventoryProducts.id, product)))[0];
    assert.equal(stock.consumptionQuantityMillis, 500); // 1 mL applied + only 0.5 mL from the 1.5 mL recipe.
    await finish("scheduled");
    stock = (await database.select().from(schema.inventoryProducts).where(eq(schema.inventoryProducts.id, product)))[0];
    assert.equal(stock.consumptionQuantityMillis, 1000); // Applied material does not return to the shelf.
    const sale = randomUUID(); await pg.query("INSERT INTO retail_sales(id,organization_id,client_id) VALUES ($1,$2,$3)", [sale, org, client]);
    await database.transaction(async tx => {
      const portions = await allocateLots(tx, { organizationId: org, productId: product, referenceType: "sale", referenceId: sale, userId: "owner", clientId: client, quantityMillis: 2000, pool: "sale" });
      assert.deepEqual(portions.map(part => part.lotId), [first.id, lots.find(lot => lot.code === "LATER")!.id]);
      await tx.update(schema.inventoryProducts).set({ currentQuantityMillis: stock.currentQuantityMillis - 2000 }).where(eq(schema.inventoryProducts.id, product));
    });
    await call("recallInventoryLot", { lotId: first.id, reason: "Manufacturer recall", confirmRecall: "on" });
    await call("recallInventoryLot", { lotId: first.id, reason: "Repeated request", confirmRecall: "on" });
    const [recall] = await database.select().from(schema.inventoryLotRecalls).where(eq(schema.inventoryLotRecalls.lotId, first.id));
    const follow = await database.select().from(schema.inventoryRecallFollowUps).where(eq(schema.inventoryRecallFollowUps.recallId, recall.id));
    assert.equal(follow.length, 3); // Clinical record, procedure allocation (including reversed) and sale.
    await assert.rejects(call("quarantineInventoryLot", { lotId: first.id, status: "active", reason: "Try release" }), /recolhidos/);
    await assert.rejects(call("closeInventoryRecall", { recallId: recall.id }), /acompanhamento/);
    await database.transaction(async tx => {
      const before = (await tx.select().from(schema.inventoryProducts).where(eq(schema.inventoryProducts.id, product)))[0];
      const restored = await restoreLots(tx, { organizationId: org, productId: product, referenceType: "sale", referenceId: sale, userId: "owner", legacyQuantityMillis: 2000 });
      await tx.update(schema.inventoryProducts).set({ currentQuantityMillis: before.currentQuantityMillis + restored.sale }).where(eq(schema.inventoryProducts.id, product));
    });
    assert.equal((await database.select().from(schema.inventoryLots).where(eq(schema.inventoryLots.id, first.id)))[0].status, "recalled");
    await assert.rejects(call("moveInventoryLot", { lotId: first.id, type: "usage", pool: "consumption", quantity: "1", reason: "Try blocked use" }), /Lote indisponível/);
    for (const item of follow) await call("updateRecallFollowUp", { followUpId: item.id, status: "resolved", notes: "Contact and follow-up completed" });
    await unified({ lotId: first.id, type: "exit", pool: "sale", quantity: "1" });
    await unified({ lotId: first.id, type: "exit", pool: "consumption", quantity: "1" });
    await call("closeInventoryRecall", { recallId: recall.id });
    assert.equal((await database.select().from(schema.inventoryLotRecalls).where(eq(schema.inventoryLotRecalls.id, recall.id)))[0].status, "closed");
    // The real POS action must roll back financial and sale rows when valid lot stock is insufficient.
    for (const [name, table] of Object.entries({ retail_sale_payments: schema.retailSalePayments })) {
      const columns = Object.values(getTableColumns(table)).map(column => `"${column.name}" ${column.enumValues ? "text" : column.getSQLType()}${column.primary ? " PRIMARY KEY DEFAULT gen_random_uuid()" : column.name === "created_at" ? " DEFAULT now()" : ""}`);
      await pg.exec(`CREATE TABLE ${name} (${columns.join(",")})`);
    }
    const retailProduct = randomUUID();
    await pg.query("INSERT INTO retail_products(id,organization_id,name) VALUES ($1,$2,'Serum')", [retailProduct, org]);
    await pg.query("UPDATE retail_product_variants SET product_id=$1,name='Default',sale_price_in_cents=100 WHERE inventory_product_id=$2", [retailProduct, product]);
    const [variant] = await database.select().from(schema.retailProductVariants).where(eq(schema.retailProductVariants.inventoryProductId, product));
    const checkout = (amount: number) => {
      const form = new FormData(); form.set("clientId", client); form.set("items", JSON.stringify([{ variantId: variant.id, quantity: amount }])); form.set("payments", JSON.stringify([{ method: "cash", amountInCents: amount * 100 }]));
      return (retail.registerRetailSale as (form: FormData) => Promise<unknown>)(form);
    };
    const beforeSales = (await pg.query<{ total: number }>("SELECT count(*)::integer AS total FROM retail_sales")).rows[0].total;
    await assert.rejects(checkout(4), /saldo válido insuficiente/);
    assert.equal((await pg.query<{ total: number }>("SELECT count(*)::integer AS total FROM retail_sales")).rows[0].total, beforeSales);
    await checkout(1);
    const [sold] = await database.select().from(schema.retailSales).where(eq(schema.retailSales.status, "completed"));
    // The synthetic historical sale has no financial entry, so choose the actual POS sale.
    const actualSale = (await database.select().from(schema.retailSales)).find(row => row.financialEntryId)!;
    assert.ok(sold);
    const reverse = new FormData(); reverse.set("saleId", actualSale.id); reverse.set("operation", "refund"); reverse.set("reason", "Customer return");
    await (retail.reverseRetailSale as (form: FormData) => Promise<unknown>)(reverse);
    const ordinary = randomUUID();
    await pg.query("INSERT INTO inventory_products(id,organization_id,name,current_quantity_millis,consumption_quantity_millis) VALUES ($1,$2,'Ordinary product',5000,0)", [ordinary, org]);
    await pg.query("INSERT INTO retail_product_variants(id,organization_id,inventory_product_id,is_for_sale) VALUES ($1,$2,$3,true)", [randomUUID(), org, ordinary]);
    await unified({ productId: ordinary, type: "entry", quantity: "1" });
    await unified({ productId: ordinary, type: "consumption", quantity: "2" });
    await unified({ productId: ordinary, type: "usage", quantity: "1" });
    await unified({ productId: ordinary, type: "exit", quantity: "1" });
    const [ordinaryStock] = await database.select().from(schema.inventoryProducts).where(eq(schema.inventoryProducts.id, ordinary));
    assert.equal(ordinaryStock.currentQuantityMillis, 3000);
    assert.equal(ordinaryStock.consumptionQuantityMillis, 1000);
    await unified({ productId: ordinary, type: "expired", quantity: "0.25" });
    await unified({ productId: ordinary, type: "recall", quantity: "0.25" });
    const ordinaryReasons = await database.select().from(schema.inventoryMovements).where(eq(schema.inventoryMovements.productId, ordinary));
    assert.ok(ordinaryReasons.some(row => row.type === "expired"));
    assert.ok(ordinaryReasons.some(row => row.type === "recall"));

    const optionalProduct = randomUUID();
    await pg.query("INSERT INTO inventory_products(id,organization_id,name,lot_tracking) VALUES ($1,$2,'Optional identification',true)", [optionalProduct, org]);
    await unified({ productId: optionalProduct, type: "entry", quantity: "1", pool: "sale" });
    await unified({ productId: optionalProduct, type: "entry", quantity: "1", pool: "sale", code: "ONLY-CODE" });
    await unified({ productId: optionalProduct, type: "entry", quantity: "1", pool: "sale", expiresOn: "2099-01-01" });
    const incomplete = await database.select().from(schema.inventoryLots).where(eq(schema.inventoryLots.productId, optionalProduct));
    assert.equal(incomplete.length, 3);
    assert.ok(incomplete.every(lot => lot.status === "quarantine"));
    const missingCode = incomplete.find(lot => lot.expiresOn === "2099-01-01")!;
    await assert.rejects(call("quarantineInventoryLot", { lotId: missingCode.id, status: "active", reason: "Release without identification" }), /sem rastreabilidade/);
    const missingExpiry = incomplete.find(lot => lot.code === "ONLY-CODE")!;
    await call("completeInventoryLotIdentification", { lotId: missingExpiry.id, code: "ONLY-CODE", expiresOn: "2099-01-01" });
    await call("quarantineInventoryLot", { lotId: missingExpiry.id, status: "active", reason: "Identification verified" });
    await call("completeInventoryLotIdentification", { lotId: missingCode.id, code: "IDENTIFIED", expiresOn: "2099-01-01" });
    await assert.rejects(unified({ productId: optionalProduct, type: "expired", quantity: "0.25", pool: "sale", lotId: missingExpiry.id }), /ainda não ocorreu/);
    await assert.rejects(unified({ productId: optionalProduct, type: "recall", quantity: "2", pool: "sale", lotId: missingExpiry.id }), /saldo válido insuficiente/);
    assert.equal((await database.select().from(schema.inventoryLotRecalls).where(eq(schema.inventoryLotRecalls.lotId, missingExpiry.id))).length, 0);
    await unified({ productId: optionalProduct, type: "recall", quantity: "0.25", pool: "sale", lotId: missingExpiry.id });
    const recalled = (await database.select().from(schema.inventoryLots).where(eq(schema.inventoryLots.id, missingExpiry.id)))[0];
    assert.equal(recalled.status, "recalled");
    assert.equal(recalled.saleQuantityMillis, 750);
    assert.equal((await database.select().from(schema.inventoryLotRecalls).where(eq(schema.inventoryLotRecalls.lotId, missingExpiry.id))).length, 1);
    await unified({ productId: optionalProduct, type: "entry", quantity: "1", pool: "sale", code: "OLD", expiresOn: "2000-01-01" });
    const [oldLot] = await database.select().from(schema.inventoryLots).where(and(eq(schema.inventoryLots.productId, optionalProduct), eq(schema.inventoryLots.code, "OLD")));
    await unified({ productId: optionalProduct, type: "expired", quantity: "0.25", pool: "sale", lotId: oldLot.id });
    assert.equal((await database.select().from(schema.inventoryLots).where(eq(schema.inventoryLots.id, oldLot.id)))[0].saleQuantityMillis, 750);
    const searchLots = movement.searchInventoryLots as (input: { kind: "expired" | "code"; query?: string; page?: number }) => Promise<{ rows: Array<{ id: string; productId: string; enteredOn: string; sale: number; consumption: number }>; page: number; hasMore: boolean }>;
    const expiredResults = await searchLots({ kind: "expired" });
    assert.ok(expiredResults.rows.some(row => row.id === oldLot.id));
    assert.ok(expiredResults.rows.every(row => row.sale + row.consumption > 0 && /^\d{2}\/\d{2}\/\d{4}$/.test(row.enteredOn)));
    const codeResults = await searchLots({ kind: "code", query: "ONLY-CODE" });
    assert.ok(codeResults.rows.some(row => row.id === missingExpiry.id));
    assert.equal((await searchLots({ kind: "code", query: "%" })).rows.length, 0, "SQL wildcards are literal search text");
    await assert.rejects(searchLots({ kind: "code", query: " " }), /Informe o número/);
    context.organizationId = outside;
    assert.equal((await searchLots({ kind: "expired" })).rows.length, 0);
    assert.equal((await searchLots({ kind: "code", query: "ONLY-CODE" })).rows.length, 0);
    context.organizationId = org;
    context.role = "receptionist";
    await assert.rejects(searchLots({ kind: "expired" }), /permissão/i);
    await assert.rejects(call("registerInventoryLot", { productId: product }));
    await assert.rejects(unified({ productId: ordinary, type: "entry", quantity: "1" }));
    await assert.rejects(call("updateRecallFollowUp", { followUpId: follow[0].id, status: "resolved", notes: "Unauthorized access" }));
    const final = (await database.select().from(schema.inventoryProducts).where(eq(schema.inventoryProducts.id, product)))[0];
    const finalLots = await database.select().from(schema.inventoryLots).where(and(eq(schema.inventoryLots.productId, product), eq(schema.inventoryLots.organizationId, org)));
    assert.equal(final.currentQuantityMillis, finalLots.reduce((sum, lot) => sum + lot.saleQuantityMillis, 0));
    assert.equal(final.consumptionQuantityMillis, finalLots.reduce((sum, lot) => sum + lot.consumptionQuantityMillis, 0));
  } finally { Reflect.deleteProperty(globalThis, key); await pg.close(); }
});
