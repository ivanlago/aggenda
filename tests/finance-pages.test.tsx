import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const globals = globalThis as typeof globalThis & { financeRows?: unknown[][] };

async function loadPage(path: string) {
  const result = await build({
    stdin: { contents: `export { default } from ${JSON.stringify(path)};`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "cjs", platform: "node", packages: "external", jsx: "automatic",
    plugins: [{ name: "finance-fixtures", setup(builder) {
      builder.onResolve({ filter: /^@\/(db$|actions\/|lib\/session$|components\/action-form$)/ }, ({ path }) => ({ path, namespace: "fixture" }));
      builder.onLoad({ filter: /./, namespace: "fixture" }, ({ path }) => {
        if (path === "@/db") return { contents: `let index=0; export const db={select(){const rows=globalThis.financeRows[index++];const query=new Proxy({}, {get(_,key){return key==='then' ? (resolve)=>Promise.resolve(rows).then(resolve) : ()=>query}});return query}};` };
        if (path === "@/lib/session") return { contents: 'export async function requireOrganization(){return {organization:{id:"org",role:"owner",timezone:"America/Bahia"}}}' };
        if (path === "@/components/action-form") return { resolveDir: process.cwd(), contents: 'import React from "react"; export function ActionForm({children, className}){return React.createElement("form",{className},children)}' };
        return { contents: "export const saveServicePackage=async()=>{},importPreviousPackage=async()=>{},toggleServicePackage=async()=>{},saveReference=async()=>{},changeReference=async()=>{},createFinancialAccount=async()=>{},createFinancialCategory=async()=>{},createFinancialCostCenter=async()=>{},createFinancialEntry=async()=>{},deleteFinancialEntry=async()=>{},updateFinancialEntryStatus=async()=>{},cancelPaymentCharge=async()=>{},refundPaymentCharge=async()=>{},sendPaymentChargeWhatsApp=async()=>{},updatePaymentCharge=async()=>{},createProviderCharge=async()=>{};" };
      });
    } }],
  });
  const pageModule = { exports: {} as { default: (props: { searchParams: Promise<Record<string, string>> }) => Promise<React.ReactNode> } };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), pageModule, pageModule.exports);
  return pageModule.exports.default;
}

const baseEntry = { id: "entry", status: "pending", type: "receivable", source: "manual", description: "Consulta", dueDate: "2026-10-10", realizedDate: null, amountInCents: 10000, categoryId: null, accountId: null, costCenterId: null };
const baseCharge = { id: "charge", financialEntryId: "entry", status: "pending", provider: "mercado_pago", originType: "financial", chargeMode: "single", description: "Consulta online", customerName: "Cliente", dueDate: "2026-10-10", amountInCents: 10000, invoiceUrl: "https://example.com/checkout" };

test("cash flow links integrated entries to charges and PDV instead of offering manual settlement", async () => {
  const page = await loadPage("./src/app/(app)/financeiro/page.tsx");
  globals.financeRows = [[baseEntry, { ...baseEntry, id: "pdv", source: "retail_sale" }], [], [], [], [baseCharge], [{ id: "sale", financialEntryId: "pdv" }]];
  try {
    const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ mes: "2026-10" }) }));
    assert.match(html, /Contas e fluxo de caixa/);
    assert.match(html, /Ver cobrança vinculada/);
    assert.match(html, /Gerenciar no PDV/);
    assert.doesNotMatch(html, /Salvar baixa manual|Gerar cobrança Asaas|Cobranças emitidas/);
    assert.match(html, /baixa desta conta é controlada/);
  } finally { delete globals.financeRows; }
});

test("charge filters affect totals and do not preselect an unrelated receivable", async () => {
  const page = await loadPage("./src/app/(app)/financeiro/cobrancas/page.tsx");
  globals.financeRows = [[baseCharge, { ...baseCharge, id: "paid", financialEntryId: "other", status: "paid", amountInCents: 90000 }], [], [{ provider: "mercado_pago", status: "active" }], [{ ...baseEntry, id: "available" }]];
  try {
    const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ status: "paid" }) }));
    assert.match(html, /Recebido online/);
    assert.match(html, /900,00/);
    assert.doesNotMatch(html, /1\.000,00/);
    assert.match(html, /Nova cobrança/);
    assert.doesNotMatch(html, /<summary[^>]*>Nova cobrança/);
    assert.doesNotMatch(html, /Homologação e prontidão|Enviar por WhatsApp/);
    assert.match(html, /Ver página da cobrança/);
  } finally { delete globals.financeRows; }
});


test("packages separate the catalog from client availability and link sales to the PDV", async () => {
  const page = await loadPage("./src/app/(app)/pacotes/page.tsx");
  const template = { id: "template", name: "Pacote de teste", description: null, priceInCents: 49900, validityDays: 30, isActive: true };
  const fixtures = () => [[{ id: "service", name: "Massagem", isActive: true }], [], [template], [{ packageId: "template", serviceId: "service", serviceName: "Massagem", quantity: 6 }], [{ id: "purchase", clientId: "client", client: "Cliente teste", packageName: "Pacote de teste", priceInCents: 49900, status: "active", purchasedAt: new Date("2020-01-01"), expiresAt: new Date("2020-02-01"), notes: null }], [{ clientPackageId: "purchase", serviceId: "service", serviceName: "Massagem", total: 6, used: 0, reserved: 0 }]];
  try {
    globals.financeRows = fixtures();
    const catalog = renderToStaticMarkup(await page({ searchParams: Promise.resolve({}) }));
    assert.match(catalog, /Vender este pacote/);
    assert.match(catalog, /vendas\?novo=1&amp;pacote=template/);
    assert.doesNotMatch(catalog, /Vender ou vincular pacote/);
    globals.financeRows = fixtures();
    const clientPage = await loadPage("./src/app/(app)/pacotes/page.tsx");
    const clients = renderToStaticMarkup(await clientPage({ searchParams: Promise.resolve({ aba: "clientes" }) }));
    assert.match(clients, /Vencido/);
    assert.match(clients, /0 sessão\(ões\) disponível/);
    assert.match(clients, /Saldo registrado sem consumo: 6/);
  } finally { delete globals.financeRows; }
});
