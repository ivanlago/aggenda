import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act, type ComponentType, type ReactNode } from "react";

test("collections bound rows, keep every record reachable, reset filters and preserve valid tables", async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: "http://localhost" });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const key of ["window", "document", "navigator", "Element", "HTMLElement", "Event", "IS_REACT_ACT_ENVIRONMENT"]) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : (dom.window as unknown as Record<string, unknown>)[key] });
  }
  const bundle = await build({ stdin: { contents: 'export { PaginatedCollection } from "./src/components/paginated-collection";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, write: false, format: "cjs", platform: "node", packages: "external" });
  const bundled = { exports: {} as { PaginatedCollection: ComponentType<{ children: ReactNode; as?: "div" | "tbody"; pageSize?: number }> } };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), bundled, bundled.exports);
  const { PaginatedCollection } = bundled.exports;
  const { createRoot } = await import("react-dom/client");
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  const click = async (text: string) => { const button = Array.from(container.querySelectorAll("button")).find(button => button.textContent === text)!; assert.ok(button); await act(async () => button.click()); };
  const cards = Array.from({ length: 25 }, (_, i) => <article key={i}>Cliente {i + 1}</article>);
  try {
    await act(async () => root.render(<PaginatedCollection>{cards}</PaginatedCollection>));
    assert.equal(container.querySelectorAll("article").length, 10);
    assert.equal(container.querySelectorAll("button")[0].disabled, true);
    await click("Próxima");
    assert.equal(container.querySelector("article")!.textContent, "Cliente 11");
    await click("Próxima");
    assert.equal(container.querySelectorAll("article").length, 5);
    assert.equal(container.querySelectorAll("button")[1].disabled, true);
    await act(async () => root.render(<PaginatedCollection>{cards.slice(0, 12)}</PaginatedCollection>));
    assert.equal(container.querySelector("article")!.textContent, "Cliente 1", "filter changes reset the page");
    await act(async () => { const select = container.querySelector("select")!; select.value = "20"; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    assert.equal(container.querySelectorAll("article").length, 12);
    assert.match(container.textContent!, /1–12 de 12/);
    await act(async () => root.render(<table><thead><tr><th>Nome</th></tr></thead><PaginatedCollection as="tbody" pageSize={20}>{Array.from({ length: 25 }, (_, i) => <tr key={i}><td>Produto {i + 1}</td></tr>)}</PaginatedCollection></table>));
    assert.equal(container.querySelector("tbody > div"), null);
    assert.equal(container.querySelector("tbody > nav"), null);
    assert.ok(container.querySelector("tbody > tr > td > nav"));
    assert.equal(container.querySelectorAll("tbody > tr").length, 21);
    await act(async () => root.render(<PaginatedCollection>{[]}</PaginatedCollection>));
    assert.equal(container.querySelector("nav"), null);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});

