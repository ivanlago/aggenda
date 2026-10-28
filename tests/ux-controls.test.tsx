import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act, type ComponentType } from "react";

test("catalog rejects unavailable barcodes and provider groups keep unrelated actions out of view", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost" });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const name of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "Event", "IS_REACT_ACT_ENVIRONMENT"]) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, value: name === "IS_REACT_ACT_ENVIRONMENT" ? true : (dom.window as unknown as Record<string, unknown>)[name] });
  }
  const bundle = await build({ stdin: { contents: 'export { PosCatalog } from "./src/components/pos-catalog"; export { PaymentProviderTabs } from "./src/components/payment-provider-tabs";', resolveDir: process.cwd(), loader: "tsx" }, jsx: "automatic", bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "next-ui", setup(builder) {
    builder.onResolve({ filter: /^next\/(link|image)$/ }, args => ({ path: args.path, namespace: "mock" }));
    builder.onLoad({ filter: /./, namespace: "mock" }, args => ({ contents: `import React from "react"; export default function View({children,fill,...props}){return React.createElement(${args.path === "next/link" ? '"a"' : '"img"'},props,children)}`, resolveDir: process.cwd(), loader: "js" }));
  } }] });
  const uiModule = { exports: {} as Record<string, ComponentType<Record<string, unknown>>> };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), uiModule, uiModule.exports);
  const { createRoot } = await import("react-dom/client");
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  const clicked: string[] = [];
  try {
    const Catalog = uiModule.exports.PosCatalog;
    await act(async () => root.render(<Catalog variants={[{ id: "blocked", label: "Produto bloqueado", priceInCents: 500, barcode: "999", stock: 0 }, { id: "valid", label: "Produto disponível", priceInCents: 500, barcode: "123", stock: 2 }]} cart={[]} addToCart={(id: string) => clicked.push(id)} />));
    const buttons = container.querySelectorAll<HTMLButtonElement>("article button");
    assert.equal(buttons[0].disabled, true);
    assert.equal(buttons[1].disabled, false);
    const barcode = container.querySelector<HTMLInputElement>('input[placeholder="Leia o código e pressione Enter"]')!;
    const typeBarcode = async (value: string) => {
      await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!.call(barcode, value); barcode.dispatchEvent(new dom.window.Event("input", { bubbles: true })); });
      await act(async () => { barcode.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    };
    await typeBarcode("999");
    assert.deepEqual(clicked, []);
    assert.match(container.querySelector('[role="status"]')!.textContent!, /Sem saldo disponível/);
    await typeBarcode("123");
    assert.deepEqual(clicked, ["valid"]);

    const Providers = uiModule.exports.PaymentProviderTabs;
    await act(async () => root.render(<Providers tabs={[{ id: "mercado-pago", label: "Mercado Pago", connected: true, content: <button>Desconectar Mercado Pago</button> }, { id: "reconciliation-cielo", label: "Cielo", connected: false, content: <p>Importar OFX</p> }]} />));
    assert.match(container.textContent!, /Desconectar Mercado Pago/);
    const reconciliation = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Conciliação de maquininha / extrato")!;
    await act(async () => reconciliation.click());
    assert.doesNotMatch(container.textContent!, /Desconectar Mercado Pago/);
    assert.match(container.querySelector('[role="tabpanel"]')!.textContent!, /Importar OFX/);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
  }
});
