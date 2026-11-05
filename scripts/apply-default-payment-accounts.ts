import { loadEnvConfig } from "@next/env";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { normalizeDatabaseUrl } from "../src/lib/database-url";

loadEnvConfig(process.cwd());
async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  const host = process.argv.find(arg => arg.startsWith("--host="))?.slice(7);
  if (host) {
    if (!/^ep-[a-z0-9-]+\.c-\d+\.[a-z0-9-]+\.aws\.neon\.tech$/.test(host)) throw new Error("Host inválido.");
    if (host.replace("-pooler", "") === url.hostname.replace("-pooler", "")) throw new Error("Use uma branch isolada para validação.");
    url.hostname = host;
  }
  url.hostname = url.hostname.replace("-pooler", "");
  const client = new pg.Client({ connectionString: normalizeDatabaseUrl(url.toString()), connectionTimeoutMillis: 20000 });
  const migration = await readFile("drizzle/0094_default_payment_accounts.sql", "utf8");
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  const entry = journal.entries.find((item: {tag:string}) => item.tag === "0094_default_payment_accounts");
  if (!entry) throw new Error("Migração ausente no journal.");
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('aggenda:payment-catalog-migration'))");
    const exists = (await client.query("SELECT to_regprocedure('aggenda_seed_payment_defaults(uuid)') IS NOT NULL AS applied")).rows[0].applied;
    if (process.argv.includes("--apply") && !exists) {
      await client.query(migration);
      await client.query("INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)", [createHash("sha256").update(migration).digest("hex"),entry.when]);
    }
    const result = await client.query("SELECT count(*)::int AS organizations, count(*) FILTER(WHERE EXISTS(SELECT 1 FROM financial_accounts a WHERE a.organization_id=o.id AND lower(a.name)='banco') AND EXISTS(SELECT 1 FROM financial_accounts a WHERE a.organization_id=o.id AND lower(a.name)='cofre'))::int AS with_default_accounts FROM organizations o");
    if (process.argv.includes("--apply") && result.rows[0].organizations !== result.rows[0].with_default_accounts) throw new Error("A verificação das contas padrão falhou.");
    await client.query("COMMIT");
    console.log(JSON.stringify({host:url.hostname,applied:exists || process.argv.includes("--apply"),...result.rows[0]}));
  } catch(error) { await client.query("ROLLBACK"); throw error; }
  finally { await client.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na migração."); process.exitCode=1; });
