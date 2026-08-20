import { loadEnvConfig } from "@next/env";
import pg from "pg";

loadEnvConfig(process.cwd());

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const result = await client.query(`
    select table_name, column_name
    from information_schema.columns
    where (table_name = 'electronic_documents' and column_name = 'structured_data')
       or (table_name = 'client_history_entries' and column_name = 'electronic_document_id')
       or (table_name = 'services' and column_name in ('short_name', 'preparation'))
    order by table_name, column_name
  `);
  await client.end();
  console.log(result.rows);
  if (result.rows.length !== 4) throw new Error(`Esperadas 4 colunas; encontradas ${result.rows.length}.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
