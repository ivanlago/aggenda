import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Client } from "pg";
import { normalizeDatabaseUrl } from "../src/lib/database-url";
loadEnvConfig(process.cwd());
async function main() {
 const taskUrl = new URL(normalizeDatabaseUrl(process.env.DATABASE_URL!));
 taskUrl.hostname = taskUrl.hostname.replace("-pooler", "");
 const client = new Client({ connectionString: taskUrl.href }); await client.connect();
 try {
  await client.query("begin"); await client.query("select pg_advisory_xact_lock(650065)");
  const latest = await client.query("select max(created_at)::text as latest from drizzle.__drizzle_migrations");
  if (latest.rows[0].latest === "1791417600000") { await client.query("rollback"); console.log("Migração 65 já aplicada."); return; }
  if (latest.rows[0].latest !== "1790899200000") throw new Error("O banco não está na migração 64 esperada.");
  const source = await readFile("drizzle/0065_appointment_rooms.sql", "utf8");
  for (const statement of source.replace(/^\uFEFF/, "").split("--> statement-breakpoint")) if (statement.trim()) await client.query(statement);
  await client.query("insert into drizzle.__drizzle_migrations (hash, created_at) values ($1,$2)",[createHash("sha256").update(source).digest("hex"),1791417600000]);
  await client.query("commit"); console.log("Migração 65 aplicada: salas e reserva segura por agendamento. Registros anteriores preservados.");
 } catch (error) { await client.query("rollback"); throw error; }
 finally { await client.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
