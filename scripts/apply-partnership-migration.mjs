// Applies only repository migrations; validates additive preservation before publishing the UI.
import assert from 'node:assert/strict';
import nextEnv from '@next/env';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
nextEnv.loadEnvConfig(process.cwd());
const mode=process.argv[2];
if(!['isolated','production'].includes(mode))throw Error('Use isolated or production.');
const url=new URL(process.env.DATABASE_URL);
const production='ep-weathered-sun-auek2y9q.c-10.us-east-1.aws.neon.tech';
const isolated='ep-purple-glade-ausm2r4f.c-10.us-east-1.aws.neon.tech';
if(url.hostname.replace('-pooler','')!==production)throw Error('Unexpected source database; stopping.');
url.hostname=mode==='isolated'?isolated:production;
url.searchParams.set('sslmode','verify-full');
const pool=new pg.Pool({connectionString:url.toString(),connectionTimeoutMillis:10000,query_timeout:30000});
try{
 const capture=async()=>({
  partners:(await pool.query('SELECT professional_id,organization_id,cnpj,cpf,is_active FROM professional_fiscal_partnerships ORDER BY professional_id')).rows,
  shares:(await pool.query('SELECT * FROM professional_fiscal_shares ORDER BY professional_id,service_id')).rows,
  finance:(await pool.query('SELECT count(*)::int AS count,coalesce(sum(amount_in_cents),0)::text AS amount FROM financial_entries')).rows,
  commissions:(await pool.query('SELECT count(*)::int AS count,coalesce(sum(amount_in_cents),0)::text AS amount FROM commission_entries')).rows,
 });
 const before=await capture();
 await migrate(drizzle(pool),{migrationsFolder:'./drizzle'});
 assert.deepEqual(await capture(),before,'Existing financial or partnership records changed');
 assert.equal((await pool.query("SELECT count(*)::int AS count FROM information_schema.columns WHERE table_name='professional_fiscal_partnerships' AND column_name='contract'")).rows[0].count,1);
 assert.equal((await pool.query("SELECT to_regclass('professional_fiscal_allocations') IS NOT NULL AS ready")).rows[0].ready,true);
 assert.equal((await pool.query("SELECT to_regclass('professional_fiscal_outflows') IS NOT NULL AS ready")).rows[0].ready,true);
 console.log(JSON.stringify({mode,migration:'0110',preserved:true,partners:before.partners.length,shares:before.shares.length,financialEntries:before.finance[0].count,commissionEntries:before.commissions[0].count}));
}finally{await pool.end();}
