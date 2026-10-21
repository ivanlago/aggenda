import { loadEnvConfig } from "@next/env";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { normalizeDatabaseUrl } from "../src/lib/database-url";

loadEnvConfig(process.cwd());
async function main() {
  const url = new URL(normalizeDatabaseUrl(process.env.DATABASE_URL!));
  url.hostname = url.hostname.replace("-pooler", "");
  const client = new Client({ connectionString: url.href });
  await client.connect();
  try {
    const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as { entries: Array<{ tag: string; when: number }> };
    const entry = journal.entries.find(item => item.tag === "0079_reference_catalogs")!;
    const previous = journal.entries.find(item => item.tag === "0078_inventory_lot_control")!;
    const source = await readFile("drizzle/0079_reference_catalogs.sql", "utf8");
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(790079)");
    const latest = await client.query("select max(created_at)::text as latest from drizzle.__drizzle_migrations");
    if (latest.rows[0].latest === String(entry.when)) { await client.query("rollback"); console.log("Migração 0079 já aplicada."); return; }
    if (latest.rows[0].latest !== String(previous.when)) throw new Error("O banco não está na migração 0078 esperada. Confira as migrações antes de continuar.");
    for (const statement of source.split("--> statement-breakpoint")) if (statement.trim()) await client.query(statement);
    await client.query("insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)", [createHash("sha256").update(source).digest("hex"), entry.when]);
    await client.query("commit");
    console.log("Migração 0079 aplicada: catálogos versionados e referência de serviços. Documentos e estoque preservados.");
  } catch (error) { await client.query("rollback"); throw error; }
  finally { await client.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Falha de migração"); process.exitCode = 1; });
