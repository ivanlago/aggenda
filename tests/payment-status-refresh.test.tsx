import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act, type ComponentType } from "react";

test("payment feedback refreshes on return, ignores hidden tabs, and stops after confirmation", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://example.com", pretendToBeVisual: true });
  const globals = globalThis as unknown as Record<string, unknown>;
  const originals = new Map<string, PropertyDescriptor | undefined>();
  let checks = 0;
  for (const key of ["window", "document", "navigator", "IS_REACT_ACT_ENVIRONMENT", "paymentTestRefresh"]) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "paymentTestRefresh" ? () => checks++ : key === "IS_REACT_ACT_ENVIRONMENT" ? true : (dom.window as unknown as Record<string, unknown>)[key] });
  }
  const bundle = await build({ stdin: { contents: 'export { PaymentStatusRefresh } from "./src/components/payment-status-refresh";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, write: false, format: "cjs", platform: "node", packages: "external", plugins: [{ name: "router", setup(b) { b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "router", namespace: "mock" })); b.onLoad({ filter: /./, namespace: "mock" }, () => ({ contents: "const router={refresh(){globalThis.paymentTestRefresh()}};export function useRouter(){return router}", loader: "js" })); } }] });
  const bundled = { exports: {} as { PaymentStatusRefresh: ComponentType<{ pending: boolean }> } };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), bundled, bundled.exports);
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("root")!);
  const Component = bundled.exports.PaymentStatusRefresh;
  try {
    await act(async () => root.render(<Component pending />));
    assert.match(dom.window.document.body.textContent!, /Aguardando confirmação/);
    await act(async () => dom.window.dispatchEvent(new dom.window.Event("focus")));
    assert.equal(checks, 1);
    await act(async () => dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange")));
    assert.equal(checks, 1, "return events are throttled");
    Object.defineProperty(dom.window.document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => dom.window.dispatchEvent(new dom.window.Event("focus")));
    assert.equal(checks, 1);
    await act(async () => dom.window.document.querySelector("button")!.click());
    assert.equal(checks, 2, "manual refresh remains available");
    await act(async () => root.render(<Component pending={false} />));
    assert.equal(dom.window.document.querySelector("button"), null);
    await act(async () => dom.window.dispatchEvent(new dom.window.Event("pageshow")));
    assert.equal(checks, 2);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globals, key); }
  }
});
