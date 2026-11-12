import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { createDirectPixPayload } from "../src/lib/booking-payment";

test("client reservation displays a locally generated QR with the exact amount; review/expiry hide the payment code", async () => {
  const output = await build({ entryPoints: ["src/components/booking-pix-panel.tsx"], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "mock-router", setup(builder) {
    builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "router", namespace: "mock" }));
    builder.onLoad({ filter: /./, namespace: "mock" }, () => ({ contents: "export function useRouter(){return {refresh(){}}}", loader: "js" }));
  } }] });
  const exported = { exports: {} as { BookingPixPanel(input: unknown): Promise<ReactElement | null> } };
  new Function("require", "module", "exports", output.outputFiles[0].text)(createRequire(import.meta.url), exported, exported.exports);
  const payload = createDirectPixPayload({ key: "pix@example.invalid", receiverName: "Empresa Teste", city: "Salvador", amountInCents: 4321, reference: "reserva123" });
  const props = { token: "synthetic-token", metadata: { directPix: { key: "pix@example.invalid", receiverName: "Empresa Teste", city: "Salvador", accountId: "synthetic-account", entryId: "synthetic-entry", payload } }, status: "scheduled", depositStatus: "direct_pending", amountInCents: 4321, expiresAt: new Date(Date.now() + 600000), timezone: "America/Bahia" };
  const render = async (changes = {}) => renderToStaticMarkup((await exported.exports.BookingPixPanel({ ...props, ...changes }))!);
  const pending = await render();
  assert.match(pending, /data:image\/png;base64,/); assert.match(pending, /43,21/); assert.ok(pending.includes(payload));
  assert.match(pending, /Já fiz o Pix/); assert.match(pending, /Empresa Teste/);
  const review = await render({ depositStatus: "direct_review", expiresAt: null });
  assert.match(review, /Aguardando conferência/); assert.ok(!review.includes("data:image/png"));
  const expired = await render({ expiresAt: new Date(Date.now() - 60000) });
  assert.match(expired, /Não pague este Pix/); assert.ok(!expired.includes(payload));
});
