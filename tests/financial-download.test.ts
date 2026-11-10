import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import ExcelJS from "exceljs";
import { build } from "esbuild";
import { PDFDocument } from "pdf-lib";
import { buildFinancialDownloadExcel, buildFinancialDownloadPdf, type FinancialDownload } from "../src/lib/financial-download";

const report: FinancialDownload = {
  title: "Extrato",
  organization: "Clínica de teste",
  filters: ["Período 2026-11", "Conta Banco"],
  summary: [{ label: "Saldo anterior", cents: 5500 }],
  columns: [{ label: "Data", width: 75, kind: "date" }, { label: "Descrição", width: 260 }, { label: "Valor", width: 90, kind: "money" }],
  rows: Array.from({ length: 100 }, (_, index) => ["2026-11-10", index === 0 ? "=1+1" : "Recebimento em cartão 💳".repeat(5), -1250]),
};

test("financial exports keep all rows, Excel values typed and PDF paginated", async () => {
  const [pdf, xlsx] = await Promise.all([buildFinancialDownloadPdf(report), buildFinancialDownloadExcel(report)]);
  assert.ok((await PDFDocument.load(pdf)).getPageCount() > 1);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(xlsx).buffer);
  const sheet = workbook.getWorksheet("Extrato")!;
  const header = 7;
  assert.equal(sheet.getRow(header).getCell(1).value, "Data");
  assert.equal(sheet.rowCount, header + 100);
  assert.deepEqual(sheet.getCell("A8").value, new Date("2026-11-10T00:00:00Z"));
  assert.equal(sheet.getCell("B8").value, "=1+1");
  assert.equal(sheet.getCell("C8").value, -12.5);
  assert.match(sheet.getCell("C8").numFmt, /R\$/);
});

test("launch downloads respect applied filters and ignore the visible page", async () => {
  const globals = globalThis as typeof globalThis & { downloadRows?: unknown[][] };
  const bundle = await build({
    entryPoints: ["src/app/api/finance/launches/route.ts"], bundle: true, write: false, format: "cjs", platform: "node", packages: "external",
    plugins: [{ name: "launch-download-fixture", setup(builder) {
      builder.onResolve({ filter: /^@\/(db|lib\/session)$/ }, ({ path }) => ({ path, namespace: "fixture" }));
      builder.onLoad({ filter: /./, namespace: "fixture" }, ({ path }) => ({
        contents: path === "@/lib/session"
          ? 'export async function requireOrganization(){return {organization:{id:"org",name:"Clínica teste",role:"owner",timezone:"America/Bahia"}}}'
          : 'let index=0; export const db={select(){const rows=globalThis.downloadRows[index++];const query=new Proxy({}, {get(_,key){return key==="then" ? (resolve)=>Promise.resolve(rows).then(resolve) : ()=>query}});return query}};',
      }));
    } }],
  });
  const fixture = { exports: {} as { GET: (request: Request) => Promise<Response> } };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), fixture, fixture.exports);
  const entry = { status: "pending", type: "payable", dueDate: "2026-11-10", realizedDate: null, accountId: "bank", categoryId: "rent", amountInCents: 19900 };
  globals.downloadRows = [
    [
      ...Array.from({ length: 13 }, (_, index) => ({ ...entry, id: String(index), description: "Incluída " + index })),
      { ...entry, accountId: "safe", description: "Outra conta" },
      { ...entry, categoryId: "other", description: "Outra categoria" },
      { ...entry, status: "paid", description: "Baixada" },
      { ...entry, dueDate: "2026-11-11", description: "Outro dia" },
    ],
    [{ id: "bank", name: "Banco" }], [{ id: "rent", name: "Aluguel" }], [], [],
  ];
  try {
    const response = await fixture.exports.GET(new Request("http://localhost/api/finance/launches?aba=pagar&mes=2026-11&conta=bank&categoria=rent&status=pending&dia=2026-11-10&linhas=10&pagina=2&formato=xlsx"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-disposition"), 'attachment; filename="contas-a-pagar-2026-11.xlsx"');
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await response.arrayBuffer());
    const descriptions: string[] = [];
    let pastHeader = false;
    workbook.getWorksheet("Contas a pagar")!.eachRow(row => {
      const description = row.getCell(3).value;
      if (pastHeader && typeof description === "string") descriptions.push(description);
      if (description === "Descrição") pastHeader = true;
    });
    assert.deepEqual(descriptions, Array.from({ length: 13 }, (_, index) => "Incluída " + index));
  } finally {
    delete globals.downloadRows;
  }
});
