import { loadEnvConfig } from "@next/env";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { normalizeDatabaseUrl } from "../src/lib/database-url";

loadEnvConfig(process.cwd());

async function main() {
  const sql = await readFile("drizzle/0063_procedure_returns.sql", "utf8");
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  const entry = journal.entries.find((item: { tag: string }) => item.tag === "0063_procedure_returns");
  const client = new pg.Client({ connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL!) });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('aggenda:procedure-return-migration'))");
    const result = await client.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'return_interval'");
    if (!result.rowCount) {
      await client.query(sql);
      const history = await client.query("SELECT to_regclass('drizzle.__drizzle_migrations') AS name");
      if (history.rows[0].name) await client.query('INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)', [createHash("sha256").update(sql).digest("hex"), entry.when]);
    }
    const columns = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'services' AND column_name IN ('return_interval', 'return_interval_unit', 'return_reminder_days')");
    const table = await client.query("SELECT to_regclass('public.procedure_returns') AS name");
    if (columns.rowCount !== 3 || !table.rows[0].name) throw new Error("Migração incompleta.");
    for (const [column, target] of [["organization_id", "organizations"], ["appointment_id", "appointments"], ["client_id", "clients"], ["service_id", "services"]]) {
      const oldName = `procedure_returns_${column}_fkey`;
      const newName = `procedure_returns_${column}_${target}_id_fk`;
      const constraint = await client.query("SELECT 1 FROM pg_constraint WHERE conrelid = 'public.procedure_returns'::regclass AND conname = $1", [oldName]);
      if (constraint.rowCount) await client.query(`ALTER TABLE procedure_returns RENAME CONSTRAINT "${oldName}" TO "${newName}"`);
    }
    const history = await client.query("SELECT to_regclass('drizzle.__drizzle_migrations') AS name");
    if (history.rows[0].name) await client.query("UPDATE drizzle.__drizzle_migrations SET hash = $1 WHERE created_at = $2", [createHash("sha256").update(sql).digest("hex"), entry.when]);
    await client.query("COMMIT");
    console.log("Migração de retornos aplicada e verificada.");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { await client.end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
