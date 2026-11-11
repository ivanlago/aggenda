import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act, type ComponentType } from "react";

test("quick registration preserves the draft, auto-selects categories, and keeps one dialog", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://example.com", pretendToBeVisual: true });
  const globals = globalThis as unknown as Record<string, unknown>;
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const key of ["window", "document", "navigator", "HTMLElement", "Element", "HTMLFormElement", "HTMLDialogElement", "FormData", "CustomEvent", "requestAnimationFrame", "IS_REACT_ACT_ENVIRONMENT", "referenceTestSave", "referenceTestRefresh", "referenceTestPrepare", "referenceTestIssue"]) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    const value = key === "IS_REACT_ACT_ENVIRONMENT" ? true : key === "requestAnimationFrame" ? dom.window.requestAnimationFrame.bind(dom.window) : (dom.window as unknown as Record<string, unknown>)[key];
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  Object.assign(dom.window.HTMLDialogElement.prototype, { showModal(this: HTMLDialogElement) { this.open = true; }, close(this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new dom.window.Event("close")); } });
  let refreshes = 0;
  let confirmations = 0;
  const saves: Record<string, string>[] = [];
  const attempted: string[] = [];
  globals.referenceTestPrepare = async (data: FormData) => ({
    entries: data.getAll("chargeInstallment").map(index => ({ id: String(index), description: "Parcela " + index })),
  });
  globals.referenceTestIssue = async (data: FormData) => {
    attempted.push(String(data.get("financialEntryId")));
    return { error: "Emissão recusada pelo provedor." };
  };
  dom.window.confirm = () => { confirmations++; return false; };
  globals.referenceTestRefresh = () => refreshes++;
  globals.referenceTestSave = async (data: FormData) => {
    const fields = Object.fromEntries(data.entries()) as Record<string, string>;
    saves.push(fields);
    return { record: { id: fields.kind === "product_subcategory" ? "new-subcategory" : "new-category", name: fields.name, categoryId: fields.categoryId, type: fields.type, isActive: true } };
  };
  const bundle = await build({ stdin: { contents: 'export { StockProductForm } from "./src/app/(app)/estoque/stock-product-form"; export { FinancialEntryControls } from "./src/components/financial-entry-form"; export { PaymentCatalogProvider } from "./src/components/payment-catalog-context";', resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, format: "cjs", platform: "node", packages: "external", jsx: "automatic", plugins: [{ name: "reference-ui", setup(builder) {
    const mocks: Record<string, string> = {
      "next/navigation": "const router={refresh(){globalThis.referenceTestRefresh()}}; export function useRouter(){return router}",
      "next/link": "import {createElement} from 'react'; export default function Link(props){return createElement('a',props)}",
      "@/actions/reference-records": "export const saveReference=(data)=>globalThis.referenceTestSave(data); export async function changeReference(){}",
      "@/actions/retail": "export async function createRetailProduct(){} export async function updateRetailVariant(){}",
      "@/actions/app": "export async function createFinancialEntry(){} export const prepareReceivableCharges=data=>globalThis.referenceTestPrepare(data);",
      "@/actions/mercado-pago": "export const createProviderCharge=data=>globalThis.referenceTestIssue(data);",
      "@/components/entity-image-field": "export function EntityImageField(){return null}",
    };
    builder.onResolve({ filter: /.*/ }, (args) => mocks[args.path] ? { path: args.path, namespace: "fixture" } : undefined);
    builder.onLoad({ filter: /./, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path], resolveDir: process.cwd() }));
  } }] });
  const compiled = { exports: {} as {
    StockProductForm: ComponentType<{ categories: []; subcategories: [] }>;
    FinancialEntryControls: typeof import("../src/components/financial-entry-form").FinancialEntryControls;
    PaymentCatalogProvider: typeof import("../src/components/payment-catalog-context").PaymentCatalogProvider;
  } };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("root")!);
  const document = dom.window.document;
  const click = async (text: string, within: ParentNode = document) => {
    const button = [...within.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === text && !item.closest("[hidden]"));
    assert.ok(button, `Button ${text} exists`);
    await act(async () => button.click());
  };
  const input = async (element: HTMLInputElement, value: string) => {
    await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
  };
  const visibleForm = () => [...document.querySelectorAll("dialog form")].find((form) => !form.closest("[hidden]"))!;
  const submit = async () => { await act(async () => { visibleForm().dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); }); };
  try {
    await act(async () => root.render(<compiled.exports.StockProductForm categories={[]} subcategories={[]} />));
    await click("Novo produto");
    const productName = document.querySelector<HTMLInputElement>('dialog input[name="name"]')!;
    await input(productName, "Produto rascunho");
    await click("+ Nova categoria");
    assert.equal(document.querySelectorAll("dialog").length, 1);
    assert.ok(productName.closest("[hidden]"));
    await input(visibleForm().querySelector<HTMLInputElement>('[name="name"]')!, "Cabelo novo");
    await submit();
    assert.equal(productName.value, "Produto rascunho");
    assert.equal(productName.closest("[hidden]"), null);
    assert.equal(document.querySelector<HTMLSelectElement>('dialog select[name="categoryId"]')!.value, "new-category");
    assert.equal(document.querySelectorAll("form form").length, 0);
    assert.ok(refreshes > 0, "Refresh runs even when the quick form unmounts on success");
    await click("+ Nova subcategoria");
    assert.equal(visibleForm().querySelector<HTMLSelectElement>('[name="categoryId"]')!.value, "new-category");
    await input(visibleForm().querySelector<HTMLInputElement>('[name="name"]')!, "Shampoo");
    await submit();
    assert.equal(document.querySelector<HTMLSelectElement>('dialog select[name="subcategoryId"]')!.value, "new-subcategory");
    assert.equal(saves[1].categoryId, "new-category");
    await click("Cancelar");
    assert.equal(confirmations, 1);
    assert.ok(document.querySelector("dialog"), "Rejecting discard keeps the draft open");

    await act(async () => root.render(<compiled.exports.FinancialEntryControls categories={[{ id: "income", name: "Receita", type: "receivable" }, { id: "expense", name: "Despesa", type: "payable" }]} today="2026-10-28" />));
    await click("Nova conta a receber");
    assert.equal(document.querySelector<HTMLInputElement>('dialog input[name="description"]')?.required, false);
    assert.equal(document.querySelector('dialog [name="costCenterId"]'), null);
    assert.ok(document.querySelector('dialog a[href="/configuracoes?aba=payments"]'));
    assert.equal(document.querySelector<HTMLInputElement>('fieldset[aria-label="Cobrança online"] input[type="checkbox"]')?.disabled, true);
    assert.ok([...document.querySelectorAll<HTMLButtonElement>("dialog button")].some(button => button.textContent === "Salvar e emitir cobranças" && button.disabled));
    const category = document.querySelector<HTMLSelectElement>('dialog select[name="categoryId"]')!;
    assert.ok(category.querySelector('option[value="income"]'));
    assert.equal(category.querySelector('option[value="expense"]'), null);
    assert.equal(document.querySelector('dialog select[name="type"]'),null);
    assert.equal(document.querySelector<HTMLInputElement>('dialog input[name="type"]')!.value,"receivable");

    const { FinancialEntryControls, PaymentCatalogProvider } = compiled.exports;
    await act(async () => root.render(<FinancialEntryControls key="payable-layout" initialType="payable" categories={[{id:"expense",name:"Despesa",type:"payable"}]} today="2027-01-31" />));
    await click("Nova conta a pagar");
    const payableForm=visibleForm();
    assert.doesNotMatch(payableForm.textContent!,/Identificação|Classificação|Valores e vencimento|Informações adicionais/);
    assert.equal(payableForm.querySelector('select[name="type"]'),null);
    assert.equal(payableForm.querySelector<HTMLInputElement>('input[name="type"]')!.value,"payable");
    assert.ok(payableForm.querySelector('select[name="categoryId"] option[value="expense"]'));
    const valueRow=payableForm.querySelector('[name="dueDate"]')!.parentElement!.parentElement;
    for(const name of ["amount","paymentMethod","accountId"]) assert.equal(payableForm.querySelector(`[name="${name}"]`)!.parentElement!.parentElement,valueRow);
    const payableSchedule=[...payableForm.querySelectorAll("select")].find(select=>select.parentElement?.textContent?.startsWith("Repetição do lançamento"))!;
    await act(async()=>{payableSchedule.value="installment";payableSchedule.dispatchEvent(new dom.window.Event("change",{bubbles:true}));});
    assert.match(payableForm.querySelector('[name="installmentCount"]')!.parentElement!.textContent!,/Qtd de parcelas mensais/);
    const paid=payableForm.querySelector<HTMLInputElement>('[name="realized"]')!;
    assert.equal(paid.closest("div")!.parentElement,payableSchedule.parentElement!.parentElement);
    assert.equal(payableForm.querySelector('[name="realizedDate"]'),null);
    await act(async()=>paid.click());
    assert.match(paid.parentElement!.textContent!,/Primeiro lançamento pago \(data\)/);
    assert.ok(payableForm.querySelector('[aria-label="Data do primeiro pagamento"]'));
    assert.equal(payableForm.querySelector('[aria-label="Cobrança online"]'),null);
    await act(async () => root.render(<FinancialEntryControls key="sem-metodo" categories={[]} today="2027-01-31"
      providers={[{ id: "asaas", name: "Asaas", isDefault: true, environment: "sandbox" }]} />));
    await click("Nova conta a receber");
    assert.equal(document.querySelector('select[name="chargeProvider"]'), null);
    const unconfiguredToggle = document.querySelector<HTMLInputElement>('fieldset[aria-label="Cobrança online"] input[type="checkbox"]')!;
    assert.equal(unconfiguredToggle.disabled, false);
    await act(async () => unconfiguredToggle.click());
    assert.equal(unconfiguredToggle.checked, true);
    assert.equal(document.querySelector<HTMLSelectElement>('select[name="chargeProvider"]')?.value, "asaas");
    assert.ok(document.querySelector('dialog a[href="/financeiro/formas-de-pagamento"]'));
    assert.ok([...document.querySelectorAll<HTMLButtonElement>("dialog button")].some(button => button.textContent === "Salvar e emitir cobranças" && button.disabled));

    await act(async () => root.render(<PaymentCatalogProvider catalog={{
      accounts: [{ id: "bank", name: "Banco" }],
      methods: [
        { id: "pix", name: "Pix", kind: "pix", defaultAccountId: "bank" },
        { id: "boleto", name: "Boleto", kind: "boleto", defaultAccountId: "bank" },
      ],
    }}><FinancialEntryControls categories={[]} today="2027-01-31" providers={[
      { id: "asaas", name: "Asaas", isDefault: false, environment: "sandbox" },
      { id: "pagbank", name: "PagBank", isDefault: true, environment: "sandbox" },
    ]} /></PaymentCatalogProvider>));
    await click("Nova conta a receber");
    assert.equal(document.querySelector('select[name="chargeProvider"]'), null);
    const chargeToggle = [...document.querySelectorAll("label")].find(label => label.textContent?.includes("Emitir cobrança online"))!.querySelector("input")!;
    await act(async () => chargeToggle.click());
    assert.equal(document.querySelector<HTMLSelectElement>('select[name="chargeProvider"]')?.value, "pagbank");
    assert.ok(document.querySelector('select[name="chargePaymentMethod"] option[value="pix"]'));
    const schedule = document.querySelector<HTMLSelectElement>("dialog select:not([name])")!;
    await act(async () => { schedule.value = "installment"; schedule.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    assert.match(document.querySelector("dialog")!.textContent!, /28\/02\/2027/);
    await act(async () => document.querySelector<HTMLInputElement>('[name="chargeInstallment"][value="1"]')!.click());
    await submit();
    assert.deepEqual(attempted, ["2"]);
    assert.match(document.querySelector("dialog")!.textContent!, /0 de 1 cobranças emitidas/);
    assert.ok(document.querySelector('a[href*="lancamento=2"]'));
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globals[key]; }
  }
});
