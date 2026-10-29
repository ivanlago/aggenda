import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableColumns } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { clientSaveError, duplicateClientPhoneMessage, parseClientInput } from "../src/lib/client-input";

const form = (values: Record<string, string>) => { const data = new FormData(); Object.entries(values).forEach(([key, value]) => data.set(key, value)); return data; };

test("client validation returns specific errors without disclosing database details", () => {
  assert.equal(parseClientInput(form({ name: "Eric Lago", phone: "(71) 99999-9999" })).phone, "71999999999");
  assert.equal(parseClientInput(form({ name: "Eric Lago", phone: "" })).phone, null);
  for (const [values, expected] of [[{ name: "A" }, /nome/], [{ name: "Eric", phone: "71" }, /WhatsApp/], [{ name: "Eric", email: "invalid" }, /e-mail/], [{ name: "Eric", birthDate: "1999-02-30" }, /nascimento/], [{ name: "Eric", weightKg: "-1" }, /peso/]] as const) assert.throws(() => parseClientInput(form(values)), expected);
  assert.equal(clientSaveError({ cause: { code: "23505", constraint: "clients_organization_phone_unique", detail: "private" } }), duplicateClientPhoneMessage);
  assert.equal(clientSaveError(new Error("internal SQL and credentials")), null);
  assert.equal(clientSaveError({ code: "23505", constraint: "different_constraint" }), null);
});

test("actual client actions reject another client's phone, preserve failed edits and allow own phone or blank", async () => {
  const pg = new PGlite();
  const globals = globalThis as unknown as { clientSaveDb?: unknown; clientSaveOrganization?: unknown };
  try {
    const columns = Object.values(getTableColumns(schema.clients)).map(column => `"${column.name}" ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}`);
    await pg.exec(`CREATE TABLE clients (${columns.join(",")}); CREATE UNIQUE INDEX clients_organization_phone_unique ON clients(organization_id,phone)`);
    const org = randomUUID(), other = randomUUID(), eric = randomUUID(), existing = randomUUID();
    await pg.query("INSERT INTO clients(id,organization_id,name,phone) VALUES ($1,$2,'Eric Siqueira Lago','71988887777'),($3,$2,'Outro cliente','71999999999')", [eric, org, existing]);
    globals.clientSaveDb = drizzle(pg, { schema });
    globals.clientSaveOrganization = { id: org, role: "owner" };
    // Compile the actual server-action bodies with a local database and image/cache
    // adapters, avoiding unrelated imports and any connection to production.
    const source = ts.createSourceFile("app.ts", await readFile("src/actions/app.ts", "utf8"), ts.ScriptTarget.Latest, true);
    const actions = source.statements.filter(node => ts.isFunctionDeclaration(node) && ["createClient", "updateClient"].includes(node.name?.text ?? "")).map(node => node.getText(source)).join("\n");
    const compiled = await build({ stdin: { contents: `import {and,eq} from 'drizzle-orm'; import {clients} from '@/db/schema'; import {parseClientInput,clientSaveError,duplicateClientPhoneMessage} from '@/lib/client-input'; import {hasClientPhoneConflict} from '@/lib/client-phone-conflict'; import {assertOrganizationPermission} from '@/lib/permissions'; const db=globalThis.clientSaveDb; async function requireOrganization(){return {organization:globalThis.clientSaveOrganization}}; function textValue(data,key){return String(data.get(key)??'').trim()} async function persistWithCatalogImage(options){return options.persist({})} function revalidatePath(){} ${actions}`, loader: "ts", resolveDir: process.cwd() }, bundle: true, write: false, format: "cjs", platform: "node", packages: "external" });
    const fixture = { exports: {} as { updateClient(data: FormData): Promise<void | { error: string }>; createClient(data: FormData): Promise<void | { error: string }> } };
    new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), fixture, fixture.exports);
    const conflicting = form({ id: eric, name: "Eric Lago", phone: "(71) 99999-9999" });
    assert.equal((await fixture.exports.updateClient(conflicting))?.error, duplicateClientPhoneMessage);
    assert.equal((await pg.query<{name:string}>("SELECT name FROM clients WHERE id=$1", [eric])).rows[0].name, "Eric Siqueira Lago");
    assert.equal(await fixture.exports.updateClient(form({ id: eric, name: "Eric Lago", phone: "(71) 98888-7777", birthDate: "1999-02-23" })), undefined);
    assert.equal((await fixture.exports.createClient(form({ name: "Duplicado", phone: "+55 (71) 99999-9999" })))?.error, duplicateClientPhoneMessage);
    assert.equal(await fixture.exports.updateClient(form({ id: eric, name: "Eric Lago", phone: "" })), undefined);
    assert.equal((await pg.query<{phone:string|null}>("SELECT phone FROM clients WHERE id=$1", [eric])).rows[0].phone, null);
    await pg.query("UPDATE clients SET phone='+55 (71) 99999-9999' WHERE id=$1", [existing]);
    assert.equal((await fixture.exports.updateClient(conflicting))?.error, duplicateClientPhoneMessage, "Legacy formatted phone also conflicts");
    globals.clientSaveOrganization = { id: other, role: "owner" };
    assert.match((await fixture.exports.updateClient(conflicting))!.error, /não encontrado/);
    globals.clientSaveOrganization = { id: org, role: "viewer" };
    await assert.rejects(fixture.exports.updateClient(conflicting));
  } finally { delete globals.clientSaveDb; delete globals.clientSaveOrganization; await pg.close(); }
});
