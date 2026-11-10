import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { PassThrough } from "node:stream";
import { build } from "esbuild";
import React from "react";
import { renderToPipeableStream, renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

const globals = globalThis as typeof globalThis & { financeRows?: unknown[][]; chargeListing?: unknown };

async function loadPage(path: string) {
  const result = await build({
    stdin: { contents: `export { default } from ${JSON.stringify(path)};`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "cjs", platform: "node", packages: "external", jsx: "automatic",
    plugins: [{ name: "finance-fixtures", setup(builder) {
      builder.onResolve({ filter: /^@\/(db$|actions\/|lib\/session$|lib\/charge-list$|components\/action-form$)/ }, ({ path }) => ({ path, namespace: "fixture" }));
      builder.onLoad({ filter: /./, namespace: "fixture" }, ({ path }) => {
        if (path === "@/lib/charge-list") return { contents: 'export async function loadChargeList(){return globalThis.chargeListing} export async function loadChargeableEntries(){return globalThis.financeRows[1]}' };
        if (path === "@/db") return { contents: `let index=0; export const db={transaction(work){return work(db)},selectDistinct(){return db.select()},select(){const rows=globalThis.financeRows[index++];const query=new Proxy({}, {get(_,key){return key==='then' ? (resolve)=>Promise.resolve(rows).then(resolve) : ()=>query}});return query}};` };
        if (path === "@/lib/session") return { contents: 'export async function requireOrganization(){return {organization:{id:"org",role:"owner",timezone:"America/Bahia"},session:{user:{id:"operator"}}}}' };
        if (path === "@/components/action-form") return { resolveDir: process.cwd(), contents: 'import React from "react"; export function ActionForm({children, className}){return React.createElement("form",{className},children)}' };
        return { contents: "export const saveServicePackage=async()=>{},toggleServicePackage=async()=>{},saveReference=async()=>{},changeReference=async()=>{},createFinancialAccount=async()=>{},createFinancialCategory=async()=>{},createFinancialCostCenter=async()=>{},createFinancialEntry=async()=>{},deleteFinancialEntry=async()=>{},updateFinancialEntryStatus=async()=>{},cancelPaymentCharge=async()=>{},refundPaymentCharge=async()=>{},sendPaymentChargeWhatsApp=async()=>{},updatePaymentCharge=async()=>{},createProviderCharge=async()=>{},openCash=async()=>{},closeCash=async()=>{},adjustPosCash=async()=>{};" };
      });
    } }],
  });
  const pageModule = { exports: {} as { default: (props: { searchParams: Promise<Record<string, string>> }) => Promise<React.ReactNode> } };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), pageModule, pageModule.exports);
  return pageModule.exports.default;
}

function renderAsync(node: React.ReactNode) {
  return new Promise<string>((resolve, reject) => {
    const output = new PassThrough().setEncoding("utf8");
    let html = "";
    output.on("data", (chunk: string) => { html += chunk; });
    output.on("end", () => resolve(html));
    output.on("error", reject);
    const router = { bfcacheId: "test", back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
    const stream = renderToPipeableStream(<AppRouterContext.Provider value={router}>{node}</AppRouterContext.Provider>, { onAllReady: () => stream.pipe(output), onError: reject });
  });
}

const baseEntry = { id: "entry", status: "pending", type: "receivable", source: "manual", description: "Consulta", dueDate: "2026-10-10", realizedDate: null, amountInCents: 10000, categoryId: null, accountId: null, costCenterId: null };
const baseCharge = { id: "charge", financialEntryId: "entry", status: "pending", provider: "mercado_pago", originType: "financial", chargeMode: "single", description: "Consulta online", customerName: "Cliente", dueDate: "2026-10-10", amountInCents: 10000, invoiceUrl: "https://example.com/checkout" };

test("cash flow links integrated entries to charges and PDV instead of offering manual settlement", async () => {
  const page = await loadPage("./src/app/(app)/financeiro/lancamentos/page.tsx");
  globals.financeRows = [[baseEntry, { ...baseEntry, id: "pdv", source: "retail_sale" }], [], [], [baseCharge], [{ id: "sale", financialEntryId: "pdv" }], []];
  try {
    const html = await renderAsync(await page({ searchParams: Promise.resolve({ mes: "2026-10" }) }));
    assert.match(html, /Contas a receber/);
    assert.match(html, /Contas a pagar/);
    assert.match(html, /Extrato/);
    assert.match(html, /\/api\/finance\/launches\?mes=2026-10&amp;aba=receber&amp;formato=xlsx|\/api\/finance\/launches\?aba=receber&amp;mes=2026-10&amp;formato=xlsx/);
    assert.match(html, /visao=cobrancas&amp;mes=2026-10&amp;cobranca=charge/);
    assert.match(html, /Ver cobrança vinculada/);
    assert.match(html, /Gerenciar no PDV/);
    assert.doesNotMatch(html, /Salvar baixa manual|Gerar cobrança Asaas|Cobranças emitidas/);
    assert.match(html, /baixa desta conta é controlada/);
  } finally { delete globals.financeRows; delete globals.chargeListing; }
});

test("charge filters affect totals and do not preselect an unrelated receivable", async () => {
  const page = await loadPage("./src/app/(app)/financeiro/lancamentos/page.tsx");
  globals.financeRows = [[], [{ provider: "mercado_pago", status: "active" }]];
  globals.financeRows[2] = [{ ...baseEntry, id: "available" }];
  globals.chargeListing = { charges: [{ ...baseCharge, id: "paid", financialEntryId: "other", status: "paid", amountInCents: 90000 }], events: [], pages: 1, currentPage: 1, totals: { count: 1, paidCount: 1, paidAmount: 90000, openCount: 0, openAmount: 0, overdueCount: 0, overdueAmount: 0 } };
  try {
    const html = await renderAsync(await page({ searchParams: Promise.resolve({ aba: "receber", visao: "cobrancas", status: "paid" }) }));
    assert.match(html, /Cobranças online/);
    assert.match(html, /Recebido online/);
    assert.match(html, /900,00/);
    assert.doesNotMatch(html, /1\.000,00/);
    assert.match(html, /Nova cobrança/);
    assert.doesNotMatch(html, /<summary[^>]*>Nova cobrança/);
    assert.doesNotMatch(html, /Homologação e prontidão|Enviar por WhatsApp/);
    assert.match(html, /Ver página da cobrança/);
  } finally { delete globals.financeRows; delete globals.chargeListing; }
});

test("the statement accumulates recorded movements over the starting balance", async () => {
  const page = await loadPage("./src/app/(app)/financeiro/lancamentos/page.tsx");
  globals.financeRows = [
    [{ id: "bank", name: "Banco", openingBalanceInCents: 10_000, createdAt: new Date("2026-09-01T12:00:00Z") }],
    [{ amount: 5000 }],
    [
      { id: 1, accountId: "bank", description: "Recebimento da venda", paymentMethodName: "Pix", amountInCents: 7500, occurredAt: new Date("2026-10-10T12:00:00Z") },
      { id: 2, accountId: "bank", description: "Estorno", paymentMethodName: "Pix", amountInCents: -2500, occurredAt: new Date("2026-10-11T12:00:00Z") },
    ],
  ];
  try {
    const html = await renderAsync(await page({ searchParams: Promise.resolve({ aba: "extrato", mes: "2026-10", conta: "bank" }) }));
    assert.match(html, /Saldo anterior.*150,00/);
    assert.match(html, /Recebimento da venda.*Saldo.*225,00/);
    assert.match(html, /Saldo ao fim do período.*200,00/);
    assert.match(html, /\/api\/finance\/launches\?aba=extrato&amp;mes=2026-10&amp;conta=bank&amp;formato=pdf/);
  } finally { delete globals.financeRows; }
});

test("Meus Caixas keeps current operations available while displaying a filtered history", async () => {
  const page = await loadPage("./src/app/(app)/financeiro/meus-caixas/page.tsx");
  const openedAt = new Date("2026-10-01T12:00:00Z");
  const closedAt = new Date("2026-10-01T15:00:00Z");
  globals.financeRows = [
    [{ id: "open", openedAt }],
    [{ id: "closed", account: "Banco", operator: "Operador de teste", openedAt, closedAt, expected: 20000, counted: 19900, difference: -100 }],
    [{ id: "operator", name: "Operador de teste" }],
    [{ id: "open", ownerId: "operator", operator: "Operador de teste", accountId: null, openedAt, opening: 10000 }],
    [{ id: 1, method: "cash", name: "Dinheiro", amount: 3500, occurredAt: openedAt }, { id: 2, method: "pix", name: "Pix", amount: 2500, occurredAt: openedAt }],
    [{ id: "adjustment", kind: "supply", reason: "Troco", amountInCents: 1000, createdAt: openedAt }],
  ];
  try {
    const html = await renderAsync(await page({ searchParams: Promise.resolve({ status: "fechado" }) }));
    assert.match(html, /Suprimento/);
    assert.match(html, /Sangria/);
    assert.match(html, /Fechar caixa/);
    assert.match(html, /Dinheiro esperado.*145,00/);
    assert.match(html, /Pix.*25,00/);
    assert.match(html, /Histórico de caixas/);
    assert.match(html, /Operador de teste/);
    assert.match(html, /Conferido.*199,00/);
  } finally { delete globals.financeRows; }
});

test("packages separate the catalog from client availability and link sales to the PDV", async () => {
  const page = await loadPage("./src/app/(app)/pacotes/page.tsx");
  const template = { id: "template", name: "Pacote de teste", description: null, priceInCents: 49900, validityDays: 30, isActive: true };
  const fixtures = () => [[{ id: "service", name: "Massagem", isActive: true }], [template], [{ packageId: "template", serviceId: "service", serviceName: "Massagem", quantity: 6 }], [{ id: "purchase", clientId: "client", client: "Cliente teste", packageName: "Pacote de teste", priceInCents: 49900, status: "active", purchasedAt: new Date("2020-01-01"), expiresAt: new Date("2020-02-01"), notes: null }], [{ clientPackageId: "purchase", serviceId: "service", serviceName: "Massagem", total: 6, used: 0, reserved: 0 }]];
  try {
    globals.financeRows = fixtures();
    const catalog = renderToStaticMarkup(await page({ searchParams: Promise.resolve({}) }));
    assert.match(catalog, /Vender este pacote/);
    assert.match(catalog, /vendas\?novo=1&amp;pacote=template/);
    assert.doesNotMatch(catalog, /Vender ou vincular pacote|Registrar pacote anterior/);
    globals.financeRows = fixtures();
    const clientPage = await loadPage("./src/app/(app)/pacotes/page.tsx");
    const clients = renderToStaticMarkup(await clientPage({ searchParams: Promise.resolve({ aba: "clientes" }) }));
    assert.match(clients, /Vencido/);
    assert.match(clients, /0 sessão\(ões\) disponível/);
    assert.match(clients, /Saldo registrado sem consumo: 6/);
  } finally { delete globals.financeRows; delete globals.chargeListing; }
});
