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
  for (const key of ["window", "document", "navigator", "HTMLElement", "Element", "HTMLFormElement", "HTMLDialogElement", "FormData", "CustomEvent", "requestAnimationFrame", "IS_REACT_ACT_ENVIRONMENT", "referenceTestSave", "referenceTestRefresh"]) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    const value = key === "IS_REACT_ACT_ENVIRONMENT" ? true : key === "requestAnimationFrame" ? dom.window.requestAnimationFrame.bind(dom.window) : (dom.window as unknown as Record<string, unknown>)[key];
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  Object.assign(dom.window.HTMLDialogElement.prototype, { showModal(this: HTMLDialogElement) { this.open = true; }, close(this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new dom.window.Event("close")); } });
  let refreshes = 0;
  let confirmations = 0;
  const saves: Record<string, string>[] = [];
  dom.window.confirm = () => { confirmations++; return false; };
  globals.referenceTestRefresh = () => refreshes++;
  globals.referenceTestSave = async (data: FormData) => {
    const fields = Object.fromEntries(data.entries()) as Record<string, string>;
    saves.push(fields);
    return { record: { id: fields.kind === "product_subcategory" ? "new-subcategory" : "new-category", name: fields.name, categoryId: fields.categoryId, type: fields.type, isActive: true } };
  };
  const bundle = await build({ stdin: { contents: 'export { StockProductForm } from "./src/app/(app)/estoque/stock-product-form"; export { FinancialEntryControls } from "./src/components/financial-entry-form";', resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, format: "cjs", platform: "node", packages: "external", jsx: "automatic", plugins: [{ name: "reference-ui", setup(builder) {
    const mocks: Record<string, string> = {
      "next/navigation": "const router={refresh(){globalThis.referenceTestRefresh()}}; export function useRouter(){return router}",
      "@/actions/reference-records": "export const saveReference=(data)=>globalThis.referenceTestSave(data); export async function changeReference(){}",
      "@/actions/retail": "export async function createRetailProduct(){} export async function updateRetailVariant(){}",
      "@/actions/app": "export async function createFinancialEntry(){}",
      "@/components/entity-image-field": "export function EntityImageField(){return null}",
    };
    builder.onResolve({ filter: /.*/ }, (args) => mocks[args.path] ? { path: args.path, namespace: "fixture" } : undefined);
    builder.onLoad({ filter: /./, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path] }));
  } }] });
  const compiled = { exports: {} as { StockProductForm: ComponentType<{ categories: []; subcategories: [] }>; FinancialEntryControls: ComponentType<{ accounts: unknown[]; categories: unknown[]; costCenters: []; today: string }> } };
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

    await act(async () => root.render(<compiled.exports.FinancialEntryControls accounts={[{ id: "inactive", name: "Antiga", isActive: false }]} categories={[{ id: "income", name: "Receita", type: "receivable" }, { id: "expense", name: "Despesa", type: "payable" }]} costCenters={[]} today="2026-10-28" />));
    await click("Novo lançamento");
    assert.equal(document.querySelector('dialog select[name="accountId"] option[value="inactive"]'), null);
    const category = document.querySelector<HTMLSelectElement>('dialog select[name="categoryId"]')!;
    assert.ok(category.querySelector('option[value="income"]'));
    assert.equal(category.querySelector('option[value="expense"]'), null);
    await act(async () => { const type = document.querySelector<HTMLSelectElement>('dialog select[name="type"]')!; type.value = "payable"; type.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    assert.ok(document.querySelector('dialog select[name="categoryId"] option[value="expense"]'));
    assert.equal(document.querySelector('dialog select[name="categoryId"] option[value="income"]'), null);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globals[key]; }
  }
});
