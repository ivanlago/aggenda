import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act, type ComponentType } from "react";

test("portal rechecks the agent's chosen slot and never reserves on opening the link", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://example.com", pretendToBeVisual: true });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const key of ["window", "document", "navigator", "IS_REACT_ACT_ENVIRONMENT", "fetch"]) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : (dom.window as unknown as Record<string, unknown>)[key] });
  }
  const start = "2026-11-17T18:00:00.000Z";
  let slots = [start];
  const requests: string[] = [];
  globalThis.fetch = async input => { requests.push(String(input)); return Response.json({ availableTimes: slots }); };
  const bundle = await build({ entryPoints: ["src/app/cliente/[slug]/portal-booking.tsx"], bundle: true, write: false, format: "cjs", platform: "node", packages: "external", jsx: "automatic", plugins: [{ name: "mocks", setup(b) {
    const mocks: Record<string, string> = { "next/navigation": "export function useRouter(){return {refresh(){}}}", "@/components/booking-voucher": "export function BookingVoucher(){return null}" };
    b.onResolve({ filter: /./ }, args => mocks[args.path] ? { path: args.path, namespace: "mock" } : undefined);
    b.onLoad({ filter: /./, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
  } }] });
  const mod = { exports: {} as { PortalBooking: ComponentType<Record<string, unknown>> } };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("root")!);
  const Component = mod.exports.PortalBooking;
  const props = { slug: "test", services: [{ id: "service", name: "Teste", durationMinutes: 30, priceInCents: 500, professionalIds: ["professional"], depositType: "fixed", depositValue: 100, depositAmountInCents: 100, repeatPolicy: "allow" }], professionals: [{ id: "professional", name: "Maria" }], timezone: "America/Bahia", horizonDays: 60, hasUpcoming: false, patientId: "patient", patientName: "Cliente", upcoming: [], initialServiceId: "service", initialProfessionalId: "professional", initialStartsAt: start };
  try {
    await act(async () => root.render(<Component {...props} />));
    assert.ok(requests[0].includes("/availability?date=2026-11-17&serviceId=service&professionalId=professional"));
    assert.deepEqual(Array.from(dom.window.document.querySelectorAll("select")).map(node => node.value), ["service", "professional"]);
    assert.equal(dom.window.document.querySelector<HTMLInputElement>('input[type="date"]')?.value, "2026-11-17");
    assert.match(dom.window.document.body.textContent!, /Revise antes de confirmar/);
    assert.ok(requests.every(url => url.includes("/availability?")), "opening never POSTs a reservation or payment");
    slots = [];
    await act(async () => root.render(<Component key="unavailable" {...props} />));
    assert.match(dom.window.document.body.textContent!, /não está mais disponível/);
    assert.doesNotMatch(dom.window.document.body.textContent!, /Revise antes de confirmar/);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});
