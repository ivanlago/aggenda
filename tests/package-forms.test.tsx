import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act, type ComponentType } from "react";

test("package and charge dialogs follow the shared lifecycle and submit only selected items", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://example.com", pretendToBeVisual: true });
  const globals = globalThis as unknown as Record<string, unknown>;
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const key of ["window", "self", "document", "navigator", "HTMLElement", "Element", "HTMLFormElement", "HTMLDialogElement", "FormData", "CustomEvent", "requestAnimationFrame", "IS_REACT_ACT_ENVIRONMENT", "packageTestSave"]) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : key === "requestAnimationFrame" ? dom.window.requestAnimationFrame.bind(dom.window) : (dom.window as unknown as Record<string, unknown>)[key] });
  }
  Object.assign(dom.window.HTMLDialogElement.prototype, { showModal(this: HTMLDialogElement) { this.open = true; }, close(this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new dom.window.Event("close")); } });
  dom.window.confirm = () => true;
  const submitted: Record<string, FormDataEntryValue>[] = [];
  globals.packageTestSave = async (data: FormData) => { submitted.push(Object.fromEntries(data.entries())); };
  const bundle = await build({ stdin: { contents: 'export { PackageDialog } from "./src/components/package-form"; export { ChargeCreateDialog } from "./src/components/charge-create-form";', resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, format: "cjs", platform: "node", packages: "external", jsx: "automatic", plugins: [{ name: "forms", setup(builder) {
    const mocks: Record<string, string> = {
      "next/navigation": "const router={refresh(){}};export function useRouter(){return router}",
      "@/actions/package-catalog": "export const saveServicePackage=(data)=>globalThis.packageTestSave(data)",
      "@/actions/mercado-pago": "export const createProviderCharge=(data)=>globalThis.packageTestSave(data)",
    };
    builder.onResolve({ filter: /.*/ }, (args) => mocks[args.path] ? { path: args.path, namespace: "fixture" } : undefined);
    builder.onLoad({ filter: /./, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path] }));
  } }] });
  type Exports = { PackageDialog: ComponentType<{ procedures: { id: string; name: string }[] }>; ChargeCreateDialog: ComponentType<{ entries: { id: string; description: string; amount: string; dueDate: string; clientName: string; clientEmail: string; clientPhone: string }[]; providers: string[]; initialEntryId?: string }> };
  const compiled = { exports: {} as Exports };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("root")!);
  const document = dom.window.document;
  const button = (name: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === name || item.getAttribute("aria-label") === name)!;
  const fill = async (selector: string, value: string) => {
    const field = document.querySelector<HTMLInputElement>(selector)!;
    await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
  };
  try {
    await act(async () => root.render(<compiled.exports.PackageDialog procedures={[{ id: "massage", name: "Massagem" }, { id: "facial", name: "Limpeza facial" }]} />));
    await act(async () => button("Novo pacote").click());
    assert.equal(button("Salvar").disabled, true);
    assert.equal(document.querySelector('input[name="quantity:facial"]'), null);
    await act(async () => button("Adicionar Massagem").click());
    await fill('input[name="quantity:massage"]', "6");
    await fill('input[name="name"]', "Pacote 6 massagens");
    await fill('input[name="price"]', "499,00");
    await act(async () => document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(submitted[0]["quantity:massage"], "6");
    assert.equal(submitted[0]["quantity:facial"], undefined);
    assert.equal(document.querySelector("dialog"), null);

    const entries = [{ id: "entry", description: "Consulta", amount: "R$ 100,00", dueDate: "28/10/2026", clientName: "Cliente teste", clientEmail: "", clientPhone: "" }];
    await act(async () => root.render(<compiled.exports.ChargeCreateDialog entries={entries} providers={["mercado_pago"]} />));
    await act(async () => button("Nova cobrança").click());
    assert.equal(document.querySelector<HTMLSelectElement>('select[name="financialEntryId"]')!.value, "");
    assert.equal(button("Gerar cobrança").disabled, true);
    await act(async () => { const select = document.querySelector<HTMLSelectElement>('select[name="financialEntryId"]')!; select.value = "entry"; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    assert.equal(document.querySelector<HTMLInputElement>('input[name="customerName"]')!.value, "Cliente teste");
    await fill('input[name="customerDocument"]', "00000000000");
    await act(async () => document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(submitted[1].financialEntryId, "entry");
    assert.equal(document.querySelector("dialog"), null);
    await act(async () => root.render(<compiled.exports.ChargeCreateDialog key="linked" entries={entries} providers={["mercado_pago"]} initialEntryId="entry" />));
    assert.ok(document.querySelector("dialog"), "Direct entry links open the shared dialog");
    assert.equal(document.querySelector<HTMLSelectElement>('select[name="financialEntryId"]')!.value, "entry");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globals[key]; }
  }
});
