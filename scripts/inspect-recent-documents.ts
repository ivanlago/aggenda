import { loadEnvConfig } from "@next/env";
import pg from "pg";

loadEnvConfig(process.cwd());

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const result = await client.query(`select id, document_type, title, left(content_snapshot, 180) as content, created_at from electronic_documents order by created_at desc limit 8`);
  await client.end();
  console.log(result.rows);
}

main().catch((error) => { console.error(error); process.exit(1); });
