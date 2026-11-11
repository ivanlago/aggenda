import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { getTableColumns, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import type { db } from "../src/db";
import * as schema from "../src/db/schema";
import { choosePayment, effectiveInstallmentTerms, hostedPaymentTypes, mercadoPagoMethodSettings, onlineInstallmentRules, onlineInstallmentTerms, pagBankSaleRules } from "../src/lib/payment-catalog-policy";
import { CashClosingRepository } from "../src/lib/cash-closing-repository";
import { closePosCash, getOpenPosCash, loadPosCashActivity, openPosCash, recordPosCashAdjustment, requireOpenPosCash } from "../src/lib/pos-cash";

test("catalog selection requires an active organization method and an active destination, preserving its identity and type", () => {
  const methods = [{ id: "one", name: "Pix no banco", kind: "pix", provider: "manual", defaultAccountId: "bank" }];
  const accounts = [{ id: "bank", name: "Banco" }, { id: "cash", name: "Caixa" }];
  assert.deepEqual(choosePayment(methods, accounts, "one"), { method: "pix", paymentMethodId: "one", paymentMethodName: "Pix no banco", accountId: "bank" });
  assert.equal(choosePayment(methods, accounts, "custom:one", "cash").accountId, "cash");
  for (const token of ["cash", "pix", "other", "another-organization"]) assert.throws(() => choosePayment(methods, accounts, token));
  assert.throws(() => choosePayment([], accounts, "one"));
  assert.throws(() => choosePayment(methods, accounts, "one", "outside"));
  assert.throws(() => choosePayment(methods, [], "one"));
  assert.equal(choosePayment(methods, accounts, "one", "cash", "efi").accountId, "bank");
  assert.equal(choosePayment(methods, accounts, "one", undefined, "mercado_pago").paymentMethodId, "one");
  assert.throws(() => choosePayment([{ ...methods[0], kind: "cash" }], accounts, "one", undefined, "efi"));
  assert.deepEqual(hostedPaymentTypes("asaas", "pix"), ["PIX"]);
  assert.throws(() => hostedPaymentTypes("asaas", "boleto"));
  assert.deepEqual(hostedPaymentTypes("efi", "pix"), ["PIX"]);
  assert.throws(() => hostedPaymentTypes("efi", "credit_card"));
  assert.deepEqual(mercadoPagoMethodSettings("link"), {});
  assert.ok(mercadoPagoMethodSettings("pix").excluded_payment_types?.every(item => item.id !== "bank_transfer"));
});

test("PagBank enforces the minimum installment and restricts overrides to authorized operators", () => {
  const rules = onlineInstallmentRules({ maxCardInstallments: 10, interestFreeCardInstallments: 3, minimumCardInstallmentInCents: 5000 });
  assert.deepEqual(effectiveInstallmentTerms(rules, 40000), { maximum: 8, interestFree: 3 });
  assert.deepEqual(effectiveInstallmentTerms(rules, 4999), { maximum: 1, interestFree: 1 });
  assert.deepEqual(effectiveInstallmentTerms({ ...rules, allowBuyerInterest: false }, 40000), { maximum: 3, interestFree: 3 });
  const override = new FormData();
  override.set("overridePagBankTerms", "on");
  override.set("pagBankMaximum", "10");
  override.set("pagBankInterestFree", "6");
  assert.throws(() => pagBankSaleRules(rules, override, false), /perfil/);
  assert.deepEqual(effectiveInstallmentTerms(pagBankSaleRules(rules, override, true), 40000), { maximum: 6, interestFree: 6 });
  assert.equal(rules.interestFree, 3);
  assert.deepEqual(onlineInstallmentTerms(rules, 40000, "mercado_pago"), { maximum: 8, interestFree: 3, mixedUnavailable: false });
  assert.deepEqual(onlineInstallmentTerms(rules, 40000, "pagbank"), { maximum: 3, interestFree: 3, mixedUnavailable: true });
  assert.equal(onlineInstallmentTerms({ ...rules, useProviderMaximum: true }, 200000, "asaas").maximum, 21);
});

test("company installment migration keeps the existing PagBank policy and permits an independent rule", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      CREATE TABLE organizations (id uuid PRIMARY KEY);
      CREATE TABLE organization_financial_integrations (organization_id uuid, provider text, metadata jsonb);
    `);
    const existing = randomUUID();
    const unconnected = randomUUID();
    await pg.query("INSERT INTO organizations VALUES ($1), ($2)", [existing, unconnected]);
    await pg.query("INSERT INTO organization_financial_integrations VALUES ($1, 'pagbank', $2)",
      [existing, JSON.stringify({ maxCardInstallments: 8, interestFreeCardInstallments: 3, minimumCardInstallmentInCents: 4000 })]);
    await pg.exec(await readFile(new URL("../drizzle/0099_online_installment_policy.sql", import.meta.url), "utf8"));
    const { rows } = await pg.query<{ id: string; online_installment_policy: Record<string, unknown> | null }>(
      "SELECT id, online_installment_policy FROM organizations",
    );
    assert.equal(onlineInstallmentRules(rows.find(row => row.id === existing)?.online_installment_policy).minimumInCents, 4000);
    assert.equal(rows.find(row => row.id === unconnected)?.online_installment_policy, null);
    await pg.query("UPDATE organizations SET online_installment_policy=$1 WHERE id=$2", [JSON.stringify({ maxCardInstallments: 6 }), unconnected]);
  } finally { await pg.close(); }
});

test("cash migration and closing: split destinations, no double counting, expenses, reversals, multi-day periods, tenant guards and replay", async () => {
  const pg = new PGlite();
  const omitted: Record<string, string[]> = { financial_entries: ["payment_method_id", "payment_method_name", "cash_managed_by_sale"], payment_methods: ["kind", "provider", "default_account_id"], retail_sale_payments: ["payment_method_id", "payment_method_name", "account_id", "refunded_in_cents"] };
  try {
    await pg.exec("CREATE TABLE organizations(id uuid PRIMARY KEY, name text); CREATE TABLE users(id text PRIMARY KEY)");
    for (const [name, table] of Object.entries({ financial_accounts: schema.financialAccounts, payment_methods: schema.paymentMethods, financial_entries: schema.financialEntries, retail_sale_payments: schema.retailSalePayments, cash_closings: schema.cashClosings })) {
      const columns = Object.values(getTableColumns(table)).filter(column => !omitted[name]?.includes(column.name)).map(column => {
        const type = column.enumValues ? "text" : column.getSQLType();
        let fallback = "";
        if (column.primary && type === "uuid") fallback = " DEFAULT gen_random_uuid()";
        else if (["created_at", "updated_at", "opened_at"].includes(column.name)) fallback = " DEFAULT timezone('UTC',clock_timestamp())";
        else if (typeof column.default === "string") fallback = ` DEFAULT '${column.default.replaceAll("'", "''")}'`;
        else if (typeof column.default === "number" || typeof column.default === "boolean") fallback = ` DEFAULT ${column.default}`;
        return `"${column.name}" ${type}${column.primary ? " PRIMARY KEY" : ""}${fallback}`;
      });
      await pg.exec(`CREATE TABLE ${name} (${columns.join(",")})`);
    }
    await pg.exec("CREATE UNIQUE INDEX payment_method_name_unique ON payment_methods(organization_id,lower(name))");
    const org = randomUUID(), outside = randomUUID(), cash = randomUUID(), bank = randomUUID(), other = randomUUID();
    await pg.query("INSERT INTO organizations VALUES ($1,'Empresa'),($2,'Outra')", [org, outside]);
    await pg.exec("INSERT INTO users VALUES ('operator')");
    await pg.query("INSERT INTO financial_accounts(id,organization_id,name,is_active) VALUES ($1,$2,'Caixa',true),($3,$2,'Banco',true),($4,$5,'Outra conta',true)", [cash, org, bank, other, outside]);
    await pg.query("INSERT INTO financial_entries(organization_id,account_id,type,status,description,amount_in_cents,due_date,updated_at) VALUES ($1,$2,'receivable','received','Histórico',500,'2020-01-01','2020-01-01')", [org, cash]);
    await pg.exec(await readFile(new URL("../drizzle/0093_payment_catalog_cash_ledger.sql", import.meta.url), "utf8"));
    assert.equal((await pg.query<{ count: number }>("SELECT count(*)::int AS count FROM payment_methods WHERE organization_id=$1", [org])).rows[0].count, 6);
    assert.equal((await pg.query<{ count: number }>("SELECT count(*)::int AS count FROM cash_movements WHERE is_legacy")).rows[0].count, 1);
    const database = drizzle(pg, { schema });
    const repository = new CashClosingRepository(database as unknown as typeof db);
    const [cashMethod, bankMethod] = await Promise.all([database.select().from(schema.paymentMethods).where(eq(schema.paymentMethods.kind, "cash")), database.select().from(schema.paymentMethods).where(eq(schema.paymentMethods.kind, "pix"))]);
    const cashId = cashMethod.find(method => method.organizationId === org)!.id;
    const pixId = bankMethod.find(method => method.organizationId === org)!.id;
    await assert.rejects(repository.open(org, "operator", other, 0), /conta ativa/);
    const opened = await repository.open(org, "operator", cash, 10000);
    const bankOpened = await repository.open(org, "operator", bank, 0);
    await assert.rejects(repository.open(org, "operator", cash, 0), /já possui/);
    await database.insert(schema.financialEntries).values({ organizationId: org, accountId: cash, cashManagedBySale: true, type: "receivable", status: "received", source: "retail_sale", description: "Resumo da venda", amountInCents: 10000, dueDate: "2026-01-01" });
    const saleId = randomUUID();
    const [first] = await database.insert(schema.retailSalePayments).values({ organizationId: org, saleId, method: "cash", paymentMethodId: cashId, paymentMethodName: "Dinheiro", accountId: cash, amountInCents: 4000, status: "received" }).returning();
    await database.insert(schema.retailSalePayments).values({ organizationId: org, saleId, method: "pix", paymentMethodId: pixId, paymentMethodName: "Pix", accountId: bank, amountInCents: 6000, status: "received" });
    const [expense] = await database.insert(schema.financialEntries).values({ organizationId: org, accountId: cash, type: "payable", status: "paid", description: "Despesa", amountInCents: 1000, dueDate: "2026-01-01" }).returning();
    await database.update(schema.financialEntries).set({ status: "paid", notes: "Sem nova saída" }).where(eq(schema.financialEntries.id, expense.id));
    assert.equal((await database.select().from(schema.cashMovements)).filter(movement => !movement.isLegacy).length, 3);
    const result = await repository.close(org, "operator", opened.id, 13000, "Conferido");
    assert.equal(result.expected, 13000);
    assert.equal(result.difference, 0);
    assert.equal((await repository.close(org, "operator", bankOpened.id, 6000, "")).expected, 6000);
    await assert.rejects(repository.close(org, "operator", opened.id, 13000, ""), /já foi fechado/);
    const next = await repository.open(org, "operator", cash, 13000);
    await database.update(schema.retailSalePayments).set({ refundedInCents: 1000, status: "partially_refunded" }).where(eq(schema.retailSalePayments.id, first.id));
    const movementCount = (await database.select().from(schema.cashMovements)).length;
    await database.update(schema.retailSalePayments).set({ refundedInCents: 1000, status: "partially_refunded" }).where(eq(schema.retailSalePayments.id, first.id));
    assert.equal((await database.select().from(schema.cashMovements)).length, movementCount);
    assert.equal((await repository.close(org, "operator", next.id, 12000, "Estorno parcial")).expected, 12000);
    const multiDay = await repository.open(org, "operator", cash, 12000);
    await pg.query("UPDATE cash_closings SET opened_at=timezone('UTC',now())-interval '3 days' WHERE id=$1", [multiDay.id]);
    const [received] = await database.insert(schema.financialEntries).values({ organizationId: org, accountId: cash, type: "receivable", status: "received", description: "Dia anterior", amountInCents: 700, dueDate: "2020-01-01" }).returning();
    await pg.query("UPDATE cash_movements SET occurred_at=timezone('UTC',now())-interval '1 day' WHERE source_id=$1", [received.id]);
    assert.equal((await repository.close(org, "operator", multiDay.id, 12700, "Mais de um dia")).expected, 12700);
    const guarded = await repository.open(org, "operator", cash, 12700);
    const [unassigned] = await database.insert(schema.financialEntries).values({ organizationId: org, type: "receivable", status: "received", description: "Sem destino", amountInCents: 100, dueDate: "2020-01-01" }).returning();
    await assert.rejects(repository.close(org, "operator", guarded.id, 12800, ""), /sem conta de destino/);
    await assert.rejects(database.update(schema.financialEntries).set({ accountId: other }).where(eq(schema.financialEntries.id, unassigned.id)));
    await database.update(schema.financialEntries).set({ accountId: cash }).where(eq(schema.financialEntries.id, unassigned.id));
    assert.equal((await repository.close(org, "operator", guarded.id, 12800, "Regularizado")).expected, 12800);

    await pg.exec("CREATE TABLE retail_sales(id uuid PRIMARY KEY, organization_id uuid NOT NULL, cash_closing_id uuid); INSERT INTO users VALUES ('second')");
    await pg.exec(await readFile(new URL("../drizzle/0097_pos_operator_cash.sql", import.meta.url), "utf8"));
    const posDatabase = database as unknown as typeof db;
    await openPosCash(posDatabase, org, "operator", 10000);
    await openPosCash(posDatabase, org, "operator", 0);
    await openPosCash(posDatabase, org, "second", 5000);
    const operatorCash = (await getOpenPosCash(posDatabase, org, "operator"))!;
    const secondCash = (await getOpenPosCash(posDatabase, org, "second"))!;
    assert.notEqual(operatorCash.id, secondCash.id);
    await assert.rejects(posDatabase.transaction(tx => requireOpenPosCash(tx, org, "second", operatorCash.id)), /Abra seu caixa/);
    const posSale = randomUUID();
    await pg.query("INSERT INTO retail_sales VALUES ($1,$2,$3)", [posSale, org, operatorCash.id]);
    const [physicalPayment] = await database.insert(schema.retailSalePayments).values([
      { organizationId: org, saleId: posSale, method: "cash", paymentMethodId: cashId, paymentMethodName: "Dinheiro", accountId: cash, amountInCents: 4000, status: "received" },
      { organizationId: org, saleId: posSale, method: "pix", paymentMethodId: pixId, paymentMethodName: "Pix", accountId: bank, amountInCents: 6000, status: "received" },
    ]).returning();
    const supply = { organizationId: org, userId: "operator", sessionId: operatorCash.id, adjustmentId: randomUUID(), manageAll: false, kind: "supply" as const, amount: 1000, reason: "Troco" };
    await recordPosCashAdjustment(posDatabase, supply);
    await recordPosCashAdjustment(posDatabase, supply);
    await recordPosCashAdjustment(posDatabase, { ...supply, adjustmentId: randomUUID(), kind: "withdrawal", amount: 500, reason: "Retirada" });
    const activity = await loadPosCashActivity(posDatabase, org, operatorCash.id);
    assert.deepEqual(activity.payments.map(row => [row.method, row.amount]), [["cash", 4000], ["pix", 6000]]);
    assert.equal(activity.adjustments.length, 2);
    await assert.rejects(closePosCash(posDatabase, org, "second", operatorCash.id, false, 14500, ""), /indisponível/);
    assert.deepEqual(await closePosCash(posDatabase, org, "operator", operatorCash.id, false, 14400, ""), { expected: 14500, counted: 14400, difference: -100 });
    await assert.rejects(recordPosCashAdjustment(posDatabase, { ...supply, adjustmentId: randomUUID() }), /já foi fechado/);
    const [latePix] = await database.insert(schema.retailSalePayments).values({
      organizationId: org, saleId: posSale, method: "pix", paymentMethodId: pixId, paymentMethodName: "Pix",
      accountId: bank, amountInCents: 2000, status: "pending",
    }).returning();
    await database.update(schema.retailSalePayments).set({ status: "received" }).where(eq(schema.retailSalePayments.id, latePix.id));
    const [closed] = await database.select().from(schema.cashClosings).where(eq(schema.cashClosings.id, operatorCash.id));
    assert.equal(closed.expectedBalanceInCents, 14500);
    assert.ok((await loadPosCashActivity(posDatabase, org, operatorCash.id)).payments.some(row => row.amount === 2000));
    await pg.transaction(async tx => {
      await tx.query("SELECT set_config('aggenda.pos_cash_reversal_session', $1, true)", [secondCash.id]);
      await tx.query("UPDATE retail_sale_payments SET status='refunded' WHERE id=$1", [physicalPayment.id]);
    });
    assert.deepEqual((await loadPosCashActivity(posDatabase, org, secondCash.id)).payments.map(row => row.amount), [-4000]);
    assert.deepEqual(await closePosCash(posDatabase, org, "second", secondCash.id, false, 1000, ""), { expected: 1000, counted: 1000, difference: 0 });
  } finally { await pg.close(); }
});
