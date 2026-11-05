import { loadEnvConfig } from "@next/env";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { normalizeDatabaseUrl } from "../src/lib/database-url";

loadEnvConfig(process.cwd());

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  const branchHost = process.argv.find(arg => arg.startsWith("--host="))?.slice(7);
  if (branchHost) {
    if (!/^ep-[a-z0-9-]+\.c-\d+\.[a-z0-9-]+\.aws\.neon\.tech$/.test(branchHost)) throw new Error("Host de validação inválido.");
    if (branchHost.replace("-pooler", "") === url.hostname.replace("-pooler", "")) throw new Error("A validação deve usar uma branch isolada.");
    url.hostname = branchHost;
  }
  url.hostname = url.hostname.replace("-pooler", "");
  const client = new pg.Client({ connectionString: normalizeDatabaseUrl(url.toString()), connectionTimeoutMillis: 20000 });
  const migration = await readFile("drizzle/0093_payment_catalog_cash_ledger.sql", "utf8");
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  const entry = journal.entries.find((item: { tag: string }) => item.tag === "0093_payment_catalog_cash_ledger");
  if (!entry) throw new Error("Migração não registrada no journal.");
  await client.connect();
  try {
    const existing = await client.query("SELECT to_regclass('public.cash_movements') AS name");
    if (!process.argv.includes("--apply")) {
      console.log(JSON.stringify({ host: url.hostname, migrationApplied: Boolean(existing.rows[0].name) }));
      return;
    }
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('aggenda:payment-catalog-migration'))");
    await client.query("LOCK TABLE financial_entries, retail_sale_payments IN SHARE ROW EXCLUSIVE MODE");
    const before = (await client.query("SELECT (SELECT count(*) FROM financial_entries)::int AS entries, (SELECT count(*) FROM retail_sale_payments)::int AS payments")).rows[0];
    if (!existing.rows[0].name) {
      await client.query(migration);
      const history = await client.query("SELECT to_regclass('drizzle.__drizzle_migrations') AS name");
      if (history.rows[0].name) await client.query("INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES ($1,$2)", [createHash("sha256").update(migration).digest("hex"), entry.when]);
    }
    const triggers = await client.query("SELECT count(*)::int AS count FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('financial_entry_cash_movement','sale_payment_cash_movement')");
    const after = (await client.query("SELECT (SELECT count(*) FROM financial_entries)::int AS entries, (SELECT count(*) FROM retail_sale_payments)::int AS payments")).rows[0];
    if (triggers.rows[0].count !== 2 || before.entries !== after.entries || before.payments !== after.payments) throw new Error("A verificação de integridade da migração falhou.");
    const wrongTenant = await client.query("SELECT count(*)::int AS count FROM payment_methods m JOIN financial_accounts a ON a.id=m.default_account_id WHERE m.organization_id<>a.organization_id");
    if (wrongTenant.rows[0].count) throw new Error("Há destinos de outra empresa no cadastro.");
    await client.query("COMMIT");
    console.log(JSON.stringify({ host: url.hostname, applied: true, existingRecordsPreserved: after, triggers: triggers.rows[0].count }));
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { await client.end(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na migração."); process.exitCode = 1; });
