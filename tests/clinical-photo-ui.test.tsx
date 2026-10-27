import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act, type ComponentType } from "react";

test("sequential photos keep treatment and visit, advance only after saving, and compare in a dialog", async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://localhost" });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const key of ["window", "document", "navigator", "Element", "HTMLElement", "HTMLFormElement", "HTMLInputElement", "FormData", "Event", "CustomEvent", "IS_REACT_ACT_ENVIRONMENT"]) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : (dom.window as unknown as Record<string, unknown>)[key] });
  }
  const bundle = await build({ stdin: { contents: 'export { ClinicalPhotoTreatmentField as Treatment } from "./src/components/clinical-photo-treatment-field"; export { ClinicalPhotoClassificationFields as Classification } from "./src/components/clinical-photo-classification-fields"; export { ClinicalPhotoComparison as Comparison } from "./src/components/clinical-photo-comparison"; export { ActionForm } from "./src/components/action-form";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, write: false, format: "cjs", platform: "node", packages: "external", plugins: [{ name: "photo-ui-boundaries", setup(builder) {
    const mocks: Record<string, string> = { "next/navigation": "const router={refresh(){}};export function useRouter(){return router}", "next/image": "import React from 'react'; export default function Image({fill,unoptimized,...props}){return React.createElement('img',props)}" };
    builder.onResolve({ filter: /./ }, args => mocks[args.path] ? { path: args.path, namespace: "photo-mock" } : undefined);
    builder.onLoad({ filter: /./, namespace: "photo-mock" }, args => ({ contents: mocks[args.path], loader: "js", resolveDir: process.cwd() }));
  } }] });
  const bundled = { exports: {} as Record<string, ComponentType<Record<string, unknown>>> };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), bundled, bundled.exports);
  const { Treatment, Classification, Comparison, ActionForm } = bundled.exports;
  const { createRoot } = await import("react-dom/client");
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  const click = async (element: Element) => act(async () => { (element as HTMLElement).click(); });
  const select = async (element: HTMLSelectElement, value: string) => act(async () => { element.value = value; element.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
  try {
    let fail = true;
    const saved: FormData[] = [];
    await act(async () => root.render(<ActionForm resetOnSuccess={false} successMessage="Salvo" action={async (data: FormData) => { if (fail) return { error: "Falha temporária" }; saved.push(data); }}><Treatment treatments={["Tratamento A", "Tratamento B"]} /><input name="visitDate" type="date" defaultValue="2026-10-27" /><Classification /><button>Salvar</button></ActionForm>));
    await select(container.querySelector('select[aria-label="Tratamento"]')!, "Tratamento B");
    await select(container.querySelector('select[name="bodyRegion"]')!, "face");
    const view = container.querySelector<HTMLSelectElement>('select[name="viewCode"]')!;
    assert.equal(view.value, "front");
    await click(container.querySelector("button")!);
    assert.equal(view.value, "front", "failed submissions must not advance the view");
    assert.match(container.textContent!, /Falha temporária/);
    fail = false;
    await click(Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Salvar")!);
    assert.equal(view.value, "three_quarter_right");
    assert.equal(saved[0].get("viewCode"), "front");
    assert.equal(new dom.window.FormData(container.querySelector("form")!).get("captureSession"), "Tratamento B");
    assert.equal(container.querySelector<HTMLInputElement>('[name="visitDate"]')!.value, "2026-10-27");
    Object.defineProperties(dom.window.HTMLDialogElement.prototype, { showModal: { configurable: true, value() { this.open = true; } }, close: { configurable: true, value() { this.open = false; } } });
    await act(async () => root.render(<Comparison photos={[{ id: "1", src: "/1.jpg", title: "Antes", phase: "before" }, { id: "2", src: "/2.jpg", title: "Depois", phase: "after" }]} />));
    await click(Array.from(container.querySelectorAll("button")).find(button => button.textContent?.includes("tela cheia"))!);
    assert.equal(container.querySelector("dialog")!.open, true);
    await click(Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Fechar comparação")!);
    assert.equal(container.querySelector("dialog")!.open, false);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});

