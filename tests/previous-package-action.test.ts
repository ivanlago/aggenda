import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";

test("previous package action validates confirmation, dates and permission before registration", async () => {
  const globals = globalThis as unknown as { previousContext?: unknown; previousRegister?: (...args: unknown[]) => unknown };
  let calls = 0;
  let recorded: unknown[] = [];
  globals.previousContext = { organization: { id: randomUUID(), role: "owner", timezone: "America/Bahia" }, session: { user: { id: "operator" } } };
  globals.previousRegister = (...args) => { calls++; recorded = args; return "imported"; };
  const compiled = await build({ entryPoints: ["src/actions/package-catalog.ts"], bundle: true, write: false, format: "cjs", platform: "node", packages: "external", plugins: [{ name: "action-fixtures", setup(builder) {
    const mocks: Record<string, string> = {
      "@/db": "export const db={}",
      "@/lib/session": "export async function requireOrganization(){return globalThis.previousContext}",
      "@/lib/package-catalog-repository": "export async function registerPreviousPackage(...args){return globalThis.previousRegister(...args)} export async function savePackageTemplate(){}",
      "next/cache": "export function revalidatePath(){}",
    };
    builder.onResolve({ filter: /.*/ }, (args) => mocks[args.path] ? { path: args.path, namespace: "fixture" } : undefined);
    builder.onLoad({ filter: /./, namespace: "fixture" }, ({ path }) => ({ contents: mocks[path] }));
  } }] });
  const actionModule = { exports: {} as { importPreviousPackage: (data: FormData) => Promise<void | { error?: string }> } };
  new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), actionModule, actionModule.exports);
  const form = new FormData();
  for (const [key, value] of Object.entries({ registrationId: randomUUID(), clientId: randomUUID(), packageId: randomUUID(), purchasedOn: "2020-01-01", expiresOn: "2020-01-31", price: "499,00", reason: "Migração de aquisição anterior" })) form.set(key, value);
  form.set(`remaining:${randomUUID()}`, "4");
  try {
    assert.ok((await actionModule.exports.importPreviousPackage(form))?.error);
    assert.equal(calls, 0);
    form.set("confirmPrevious", "on"); form.set("purchasedOn", "2099-01-01");
    assert.ok((await actionModule.exports.importPreviousPackage(form))?.error);
    assert.equal(calls, 0);
    form.set("purchasedOn", "2020-01-01"); form.set("expiresOn", "2019-01-01");
    assert.ok((await actionModule.exports.importPreviousPackage(form))?.error);
    assert.equal(calls, 0);
    form.set("expiresOn", "2020-01-31");
    await actionModule.exports.importPreviousPackage(form);
    assert.equal(calls, 1);
    const input = recorded[3] as { purchasedAt: Date; expiresAt: Date; priceInCents: number };
    assert.equal(input.purchasedAt.toISOString(), "2020-01-01T15:00:00.000Z");
    assert.equal(input.expiresAt.toISOString(), "2020-02-01T02:59:59.999Z");
    assert.equal(input.priceInCents, 49900);
    globals.previousContext = { organization: { id: randomUUID(), role: "professional", timezone: "America/Bahia" }, session: { user: { id: "other" } } };
    await assert.rejects(actionModule.exports.importPreviousPackage(form));
    assert.equal(calls, 1);
  } finally { delete globals.previousContext; delete globals.previousRegister; }
});
