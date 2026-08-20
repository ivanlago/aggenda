import "dotenv/config";

import pg from "pg";

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const result = await client.query(`
    select table_name, column_name
    from information_schema.columns
    where (table_name = 'electronic_documents' and column_name = 'structured_data')
       or (table_name = 'client_history_entries' and column_name = 'electronic_document_id')
    order by table_name, column_name
  `);
  await client.end();
  if (result.rows.length !== 2) throw new Error(`Esperadas 2 colunas; encontradas ${result.rows.length}.`);
  console.log(result.rows);
}

main().catch((error) => { console.error(error); process.exit(1); });
