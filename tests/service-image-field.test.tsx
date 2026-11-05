import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act, type ComponentType } from "react";

test("service image is optional, previews selected files before saving, and releases previews", async () => {
  const dom = new JSDOM('<form><div id="root"></div></form>', { url: "http://localhost" });
  const original = new Map<string, PropertyDescriptor | undefined>();
  for (const key of ["window", "document", "navigator", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"]) {
    original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : (dom.window as unknown as Record<string, unknown>)[key], configurable: true, writable: true });
  }
  const createUrl = URL.createObjectURL, revokeUrl = URL.revokeObjectURL;
  let sequence = 0;
  const released: string[] = [];
  URL.createObjectURL = () => `blob:preview-${++sequence}`;
  URL.revokeObjectURL = url => { released.push(url); };
  const bundle = await build({ entryPoints: ["src/components/catalog-image-field.tsx"], bundle: true, write: false, format: "cjs", platform: "node", packages: "external", plugins: [{ name: "image-boundary", setup(builder) {
    builder.onResolve({ filter: /^react$/ }, () => ({ path: "react", external: true }));
    builder.onResolve({ filter: /^next\/image$/ }, () => ({ path: "image", namespace: "mock" }));
    builder.onLoad({ filter: /./, namespace: "mock" }, () => ({ contents: 'import React from "react";export default function Image({src,alt,onError}){return React.createElement("img",{src,alt,onError})}', loader: "js" }));
  } }] });
  const bundled = { exports: {} as { CatalogImageField: ComponentType<{ currentUrl?: string; label: string }> } };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), bundled, bundled.exports);
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("root")!);
  const { CatalogImageField } = bundled.exports;
  try {
    await act(async () => { root.render(<CatalogImageField currentUrl="https://example.com/current.png" label="Imagem do serviço" />); });
    const input = dom.window.document.querySelector<HTMLInputElement>('input[type="file"]')!;
    assert.equal(input.required, false);
    assert.equal(input.name, "image");
    assert.equal(dom.window.document.querySelector("img")?.getAttribute("src"), "https://example.com/current.png");
    const select = async (name: string, size = 10) => {
      Object.defineProperty(input, "files", { configurable: true, value: [new dom.window.File([new Uint8Array(size)], name, { type: "image/png" })] });
      await act(async () => { input.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    };
    await select("first.png");
    assert.equal(dom.window.document.querySelector("img")?.getAttribute("src"), "blob:preview-1");
    await select("second.png");
    assert.equal(dom.window.document.querySelector("img")?.getAttribute("src"), "blob:preview-2");
    assert.deepEqual(released, ["blob:preview-1"]);
    await select("large.png", 10 * 1024 * 1024 + 1);
    assert.match(dom.window.document.querySelector('[role="alert"]')?.textContent ?? "", /até 10 MB/);
    assert.equal(dom.window.document.querySelector("img")?.getAttribute("src"), "https://example.com/current.png");
    const remove = dom.window.document.querySelector<HTMLInputElement>('[name="removeImage"]')!;
    await act(async () => { remove.click(); });
    assert.equal(dom.window.document.querySelector("img"), null);
    assert.equal(remove.checked, true);
    await select("last.png");
    assert.equal(dom.window.document.querySelector("img")?.getAttribute("src"), "blob:preview-3");
    assert.equal(dom.window.document.querySelector('[name="removeImage"]'), null);
  } finally {
    await act(async () => { root.unmount(); });
    URL.createObjectURL = createUrl;
    URL.revokeObjectURL = revokeUrl;
    for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    dom.window.close();
  }
  assert.deepEqual(released, ["blob:preview-1", "blob:preview-2", "blob:preview-3"]);
});
