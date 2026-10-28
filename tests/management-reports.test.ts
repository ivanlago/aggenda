import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { canReadReport, parseReportFilters, shiftReportDate, type ManagementReport } from "../src/lib/management-reports";
import { managementReportExcel, managementReportPdf } from "../src/lib/management-report-export";

test("report filters validate dates, ranges, identifiers and permissions", () => {
  assert.equal(parseReportFilters({}, "2026-10-28").from, "2026-10-01");
  assert.equal(shiftReportDate("2024-03-01", -1), "2024-02-29");
  for (const input of [{ de: "2026-02-30" }, { de: "2026-10-29", ate: "2026-10-28" }, { de: "2024-01-01" }, { relatorio: "unknown" }, { conta: "invalid" }, { situacao: "anything" }]) assert.throws(() => parseReportFilters(input, "2026-10-28"));
  assert.equal(parseReportFilters({ relatorio: "inativos", ate: "2020-01-01", de: "2030-01-01" }, "2026-10-28").from, "2020-01-01");
  assert.equal(canReadReport("professional", "resumo"), false);
  assert.equal(canReadReport("professional", "inativos"), false);
  assert.equal(canReadReport("manager", "fluxo"), false);
  assert.equal(canReadReport("owner", "resumo"), true);
});

test("six reports isolate companies and use the correct dates, statuses and denominators", async () => {
  const pg = new PGlite();
  const globals = globalThis as unknown as { managementTestDb?: unknown };
  globals.managementTestDb = drizzle(pg);
  const compiled = await build({ entryPoints: ["src/lib/management-report-data.ts"], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "database-fixture", setup(builder) {
    builder.onResolve({ filter: /^@\/db$/ }, () => ({ path: "db", namespace: "fixture" }));
    builder.onLoad({ filter: /./, namespace: "fixture" }, () => ({ contents: "export const db=globalThis.managementTestDb" }));
  } }] });
  const fixtureModule = { exports: {} as typeof import("../src/lib/management-report-data") };
  new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), fixtureModule, fixtureModule.exports);
  const organization = { id: "a", name: "Empresa teste", timezone: "America/Bahia", role: "owner" as const };
  const load = (relatorio: string, extra: Record<string, string> = {}) => fixtureModule.exports.loadManagementReport(organization, parseReportFilters({ relatorio, de: "2026-10-01", ate: "2026-10-28", ...extra }, "2026-10-28"));
  try {
    await pg.exec(`
      CREATE TABLE clients(id text,organization_id text,name text,phone text,email text,created_at timestamp);
      CREATE TABLE financial_accounts(id text,organization_id text,name text);
      CREATE TABLE financial_categories(id text,organization_id text,name text);
      CREATE TABLE financial_cost_centers(id text,organization_id text,name text);
      CREATE TABLE financial_entries(id text,organization_id text,description text,type text,status text,due_date date,realized_date date,amount_in_cents integer,client_id text,account_id text,category_id text,cost_center_id text,category text);
      CREATE TABLE retail_sales(id text,organization_id text,sold_at timestamp,client_id text,status text,subtotal_in_cents integer,discount_in_cents integer,total_in_cents integer);
      CREATE TABLE retail_quotes(id text,organization_id text,created_at timestamp,client_id text,client_name text,total_in_cents integer,valid_until date,sale_id text);
      CREATE TABLE retail_sale_items(id text,organization_id text,sale_id text,product_name text,package_id text,service_id text,quantity integer,total_in_cents integer);
      CREATE TABLE appointments(id text,organization_id text,client_id text,status text,starts_at timestamp);
      CREATE TABLE crm_opportunities(id text,organization_id text,created_at timestamp,source text,status text,value_in_cents integer);
      INSERT INTO clients VALUES ('c','a','Cliente antigo','71999999999','teste@example.com','2026-10-01 03:00'),('new','a','Sem atendimento',null,null,'2026-10-02'),('other','b','OUTRA EMPRESA',null,null,'2026-10-02');
      INSERT INTO financial_entries VALUES ('r','a','Recebimento antigo','receivable','received','2026-09-01','2026-10-02',12000,'c',null,null,null,null),('p','a','Despesa','payable','paid','2026-10-05','2026-10-05',2000,null,null,null,null,null),('pending','a','Previsto','receivable','pending','2026-10-10',null,5000,null,null,null,null,null),('cancel','a','Cancelado','receivable','cancelled','2026-10-10',null,90000,null,null,null,null,null),('outside','b','SEGREDO','receivable','received','2026-10-02','2026-10-02',9999999,null,null,null,null,null);
      INSERT INTO retail_sales VALUES ('s','a','2026-10-02 15:00','c','completed',10000,1000,9000),('cancel','a','2026-10-03','c','cancelled',99999,0,99999),('boundary','a','2026-10-01 02:30','c','completed',100,0,100),('outside','b','2026-10-02',null,'completed',99999,0,99999);
      INSERT INTO retail_quotes VALUES ('q','a','2026-10-04','c',null,15000,'2026-12-01',null);
      INSERT INTO retail_sale_items VALUES ('i','a','s','Pacote teste','p',null,1,10000);
      INSERT INTO appointments VALUES ('old','a','c','completed','2026-06-01 15:00'),('cancel','a','c','cancelled','2026-10-02'),('future','a','c','confirmed','2026-11-01 15:00'),('done','a','new','completed','2026-10-05 15:00'),('outside','b','other','completed','2026-10-02');
      INSERT INTO crm_opportunities VALUES ('w','a','2026-10-02','Instagram','won',10000),('l','a','2026-10-03','Instagram','lost',20000),('o','a','2026-10-04','Instagram','open',30000),('outside','b','2026-10-03','SEGREDO','won',999999);
    `);
    const summary = await load("resumo");
    assert.equal(summary.tables[0].rows[0][1], 90);
    assert.equal(summary.tables[0].rows[1][1], 120);
    assert.equal(summary.tables[0].rows[3][1], 100);
    assert.equal(summary.tables[1].rows[1][1], 1);
    const cash = await load("fluxo");
    assert.equal(cash.tables[0].rows[0][1], 120, "Realization date includes an older due date");
    assert.equal(cash.tables.at(-1)!.rows.length, 3, "Cancelled entries excluded");
    const accounts = await load("contas");
    assert.equal(accounts.tables.at(-1)!.rows.length, 3, "Due-date filtering excludes old receipt");
    const sales = await load("vendas");
    assert.equal(sales.tables[0].rows[0][1], 90);
    assert.equal(sales.tables[2].rows.length, 2);
    assert.equal(sales.tables[2].rows[0][0], "2026-10-02");
    assert.equal(sales.tables[3].rows.length, 1);
    const origins = await load("origens");
    assert.equal(origins.tables[0].rows[0][5], 50, "Open opportunities excluded from conversion denominator");
    assert.equal(origins.tables[0].rows[0][6], 100);
    const inactive = await load("inativos");
    assert.equal(inactive.tables[0].rows.length, 1);
    assert.equal(inactive.tables[0].rows[0][0], "Cliente antigo");
    assert.equal(inactive.tables[0].rows[0][5], "2026-11-01");
    assert.equal((await load("inativos", { busca: "inexistente" })).tables[0].rows.length, 0);
    for (const report of [summary, cash, accounts, sales, origins, inactive]) assert.doesNotMatch(JSON.stringify(report), /SEGREDO|OUTRA EMPRESA/);
    await assert.rejects(fixtureModule.exports.loadManagementReport({ ...organization, role: "manager" }, parseReportFilters({ relatorio: "resumo" }, "2026-10-28")), /permissão/);
  } finally { delete globals.managementTestDb; await pg.close(); }
});

test("exports preserve all rows, Excel numbers/dates, safe strings and multi-page PDFs", async () => {
  const report: ManagementReport = { title: "Relatório de teste", organization: "Empresa de teste", generatedAt: "2026-10-28T15:00:00Z", filters: ["Período: 2026-10-01 a 2026-10-28"], notes: ["Dados fictícios para validação."], tables: [{ title: "Detalhamento", columns: [{ title: "Descrição", width: 2 }, { title: "Valor", kind: "money" }, { title: "Data", kind: "date" }, { title: "Taxa", kind: "percent" }], rows: Array.from({ length: 105 }, (_, index) => [index === 0 ? '=HYPERLINK("https://example.com")' : `Registro ${index} · São João 😀 ${"descrição extensa ".repeat(8)}`, 123.45, "2026-10-28", 50]) }] };
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await managementReportExcel(report)).buffer as ArrayBuffer);
  const sheet = workbook.worksheets[1];
  assert.equal(sheet.rowCount, 106);
  assert.equal(sheet.getCell("A2").type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell("B2").value, 123.45);
  assert.ok(sheet.getCell("C2").value instanceof Date);
  assert.equal(sheet.getCell("D2").value, 0.5);
  const pdf = await PDFDocument.load(await managementReportPdf(report));
  assert.ok(pdf.getPageCount() > 2);
  assert.equal(pdf.getTitle(), report.title);
});

test("report endpoint rejects invalid filters and unauthorized exports before loading data", async () => {
  const globals = globalThis as unknown as { managementRouteRole?: string; managementRouteCalls?: number };
  globals.managementRouteRole = "manager";
  globals.managementRouteCalls = 0;
  const compiled = await build({ entryPoints: ["src/app/api/reports/route.ts"], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "route-fixture", setup(builder) {
    const mocks: Record<string, string> = {
      "@/lib/session": "export async function requireOrganization(){return {organization:{id:'a',name:'Teste',timezone:'America/Bahia',role:globalThis.managementRouteRole}}}",
      "@/lib/management-report-data": "export async function loadManagementReport(){globalThis.managementRouteCalls++;return {}}",
      "@/lib/management-report-export": "export async function managementReportPdf(){return new Uint8Array([1])} export async function managementReportExcel(){return new Uint8Array([2])}",
    };
    builder.onResolve({ filter: /.*/ }, ({ path }) => mocks[path] ? { path, namespace: "fixture" } : undefined);
    builder.onLoad({ filter: /./, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path] }));
  } }] });
  const fixtureModule = { exports: {} as typeof import("../src/app/api/reports/route") };
  new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), fixtureModule, fixtureModule.exports);
  try {
    assert.equal((await fixtureModule.exports.GET(new Request("https://example.com/api/reports?relatorio=fluxo&formato=pdf"))).status, 403);
    assert.equal((await fixtureModule.exports.GET(new Request("https://example.com/api/reports?relatorio=origens&de=invalid&formato=pdf"))).status, 400);
    assert.equal((await fixtureModule.exports.GET(new Request("https://example.com/api/reports?relatorio=origens&formato=exe"))).status, 400);
    assert.equal(globals.managementRouteCalls, 0);
    for (const format of ["pdf", "xlsx"]) {
      const response = await fixtureModule.exports.GET(new Request(`https://example.com/api/reports?relatorio=origens&formato=${format}`));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.match(response.headers.get("content-disposition")!, new RegExp(`\\.${format}`));
    }
    assert.equal(globals.managementRouteCalls, 2);
  } finally { delete globals.managementRouteRole; delete globals.managementRouteCalls; }
});
