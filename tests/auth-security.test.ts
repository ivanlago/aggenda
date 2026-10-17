import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableColumns } from "drizzle-orm";
import * as schema from "../src/db/schema";

test("updated authentication keeps login, sessions, origin protection and password reset", async () => {
  const database = new PGlite();
  const scope = globalThis as typeof globalThis & { authSecurityDb?: unknown; authSecurityReset?: { token: string } };
  const variables = ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "NEXT_PUBLIC_APP_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];
  const previous = variables.map(key => [key, process.env[key]] as const);
  try {
    process.env.BETTER_AUTH_SECRET = "Synthetic-test-only-secret-2d85c88a12cfeb0785d6620c";
    process.env.BETTER_AUTH_URL = "http://localhost:3456"; process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3456";
    delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET;
    for (const [name, table] of Object.entries({ users: schema.users, sessions: schema.sessions, accounts: schema.accounts, verifications: schema.verifications })) {
      const columns = Object.values(getTableColumns(table)).map(column => `"${column.name}" ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}${["must_change_password", "email_verified"].includes(column.name) ? " DEFAULT false" : ""}`);
      await database.exec(`CREATE TABLE "${name}" (${columns.join(",")})`);
    }
    scope.authSecurityDb = drizzle(database, { schema });
    const bundled = await build({ entryPoints: ["src/lib/auth.ts"], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "isolated-auth", setup(builder) {
      const mocks: Record<string, string> = { "@/db": "export const db=globalThis.authSecurityDb;", "@/lib/email": "export async function sendPasswordResetEmail(input){globalThis.authSecurityReset=input;}" };
      builder.onResolve({ filter: /./ }, args => mocks[args.path] ? { path: args.path, namespace: "auth-mock" } : undefined);
      builder.onLoad({ filter: /./, namespace: "auth-mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
    } }] });
    const exported = { exports: {} as { auth: { handler(request: Request): Promise<Response> } } };
    new Function("require", "module", "exports", bundled.outputFiles[0].text)(createRequire(import.meta.url), exported, exported.exports);
    const request = (path: string, body?: Record<string, unknown>, cookie?: string, origin = "http://localhost:3456") => exported.exports.auth.handler(new Request(`http://localhost:3456/api/auth/${path}`, {
      method: body ? "POST" : "GET", headers: { origin, ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined,
    }));
    const credentials = { email: "synthetic@example.invalid", password: "Synthetic-password-123!" };
    assert.equal((await request("sign-up/email", { ...credentials, name: "Synthetic user" })).status, 200);
    assert.equal((await request("sign-in/email", { ...credentials, password: "wrong-password" })).status, 401);
    assert.equal((await request("sign-in/email", credentials, undefined, "https://untrusted.invalid")).status, 403);
    const login = await request("sign-in/email", credentials); assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; "); assert.ok(cookie);
    const session = await request("get-session", undefined, cookie); assert.equal((await session.json()).user.email, credentials.email);
    assert.equal((await request("sign-out", {}, cookie)).status, 200);
    assert.equal(await (await request("get-session", undefined, cookie)).json(), null);
    await database.exec("UPDATE users SET must_change_password=true");
    assert.equal((await request("request-password-reset", { email: credentials.email, redirectTo: "http://localhost:3456/redefinir-senha" })).status, 200);
    assert.ok(scope.authSecurityReset?.token);
    const replacement = "Replacement-synthetic-password-123!";
    assert.equal((await request("reset-password", { token: scope.authSecurityReset.token, newPassword: replacement })).status, 200);
    assert.equal((await database.query<{ must_change_password: boolean }>("SELECT must_change_password FROM users")).rows[0].must_change_password, false);
    assert.equal((await request("sign-in/email", credentials)).status, 401);
    assert.equal((await request("sign-in/email", { ...credentials, password: replacement })).status, 200);
  } finally {
    delete scope.authSecurityDb; delete scope.authSecurityReset;
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await database.close();
  }
});
