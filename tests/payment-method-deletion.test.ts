import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

test("payment deletion checks permission and tenant, deletes unused records and preserves linked history", async () => {
  const pg = new PGlite();
  const scope = globalThis as unknown as Record<string, unknown>;
  try {
    await pg.exec(`CREATE TABLE payment_methods(id uuid PRIMARY KEY, organization_id uuid NOT NULL);
      CREATE TABLE history(id integer PRIMARY KEY, method_id uuid REFERENCES payment_methods(id) ON DELETE RESTRICT);
      INSERT INTO payment_methods VALUES
      ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010'),
      ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010'),
      ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000020');
      INSERT INTO history VALUES(1,'00000000-0000-4000-8000-000000000002');`);
    scope.paymentDeletionDb = drizzle(pg);
    scope.paymentDeletionRole = "owner";
    const bundle = await build({ entryPoints: ["src/actions/payment-methods.ts"], bundle: true, write: false, format: "cjs", platform: "node", packages: "external", plugins: [{ name: "payment-deletion", setup(builder) {
      const mocks: Record<string, string> = {
        "@/db": "export const db=globalThis.paymentDeletionDb;",
        "@/lib/session": "export async function requireOrganization(){return {organization:{id:'00000000-0000-4000-8000-000000000010',role:globalThis.paymentDeletionRole}}}",
        "next/cache": "export function revalidatePath(){}",
      };
      builder.onResolve({ filter: /./ }, args => mocks[args.path] ? { path: args.path, namespace: "payment-deletion" } : undefined);
      builder.onLoad({ filter: /./, namespace: "payment-deletion" }, args => ({ contents: mocks[args.path], loader: "js" }));
    } }] });
    const compiled = { exports: {} as { deletePaymentMethod(data: FormData): Promise<{error?: string} | undefined> } };
    new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
    const remove = (id: string) => { const form = new FormData(); form.set("id", id); return compiled.exports.deletePaymentMethod(form); };
    scope.paymentDeletionRole = "viewer";
    await assert.rejects(remove("00000000-0000-4000-8000-000000000001"));
    scope.paymentDeletionRole = "owner";
    assert.match((await remove("invalid"))?.error ?? "", /inválida/);
    assert.match((await remove("00000000-0000-4000-8000-000000000003"))?.error ?? "", /não encontrada/);
    assert.match((await remove("00000000-0000-4000-8000-000000000002"))?.error ?? "", /desativá-la/);
    assert.equal(await remove("00000000-0000-4000-8000-000000000001"), undefined);
    assert.equal((await pg.query("SELECT * FROM payment_methods")).rows.length, 2);
    assert.equal((await pg.query("SELECT * FROM history")).rows.length, 1);
  } finally {
    delete scope.paymentDeletionDb;
    delete scope.paymentDeletionRole;
    await pg.close();
  }
});
