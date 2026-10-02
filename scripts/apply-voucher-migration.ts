import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Client } from "pg";
import { normalizeDatabaseUrl } from "../src/lib/database-url";

loadEnvConfig(process.cwd());
async function main() {
  const client = new Client({ connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL!) });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(640064)");
    const latest = await client.query("select max(created_at)::text as latest from drizzle.__drizzle_migrations");
    if (latest.rows[0].latest === "1790899200000") { await client.query("rollback"); console.log("Migração 64 já aplicada."); return; }
    if (latest.rows[0].latest !== "1790812800000") throw new Error("O banco não está na migração 63 esperada.");
    const source = await readFile("drizzle/0064_voucher_campaigns.sql", "utf8");
    for (const statement of source.split("--> statement-breakpoint")) if (statement.trim()) await client.query(statement);
    await client.query("insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)", [createHash("sha256").update(source).digest("hex"), 1790899200000]);
    await client.query("commit");
    console.log("Migração 64 aplicada: vouchers exclusivos, utilização e fila de envios.");
  } catch (error) { await client.query("rollback"); throw error; }
  finally { await client.end(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
