// Only this isolated compute is allowed. Test fixtures are always rolled back.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
nextEnv.loadEnvConfig(process.cwd());
const url=new URL(process.env.DATABASE_URL);
url.hostname="ep-purple-glade-ausm2r4f.c-10.us-east-1.aws.neon.tech";
url.searchParams.set("sslmode","verify-full");
const pool=new pg.Pool({connectionString:url.toString(),connectionTimeoutMillis:10000,query_timeout:20000});
try {
  const before=await pool.query("SELECT count(*)::int AS count, COALESCE(sum(amount_in_cents),0)::text AS amount FROM commission_entries");
  await migrate(drizzle(pool),{migrationsFolder:"./drizzle"});
  assert.deepEqual((await pool.query("SELECT count(*)::int AS count, COALESCE(sum(amount_in_cents),0)::text AS amount FROM commission_entries")).rows,before.rows);
  const tx=await pool.connect();
  try {
    await tx.query("BEGIN");
    const org=randomUUID(),executor=randomUUID(),assistant=randomUUID(),client=randomUUID(),service=randomUUID(),visit=randomUUID(),sale=randomUUID();
    const owner=`exec-${randomUUID()}`,helper=`helper-${randomUUID()}`;
    await tx.query("INSERT INTO users(id,name,email) VALUES($1,'Executor teste',$2),($3,'Assistente teste',$4)",[owner,`${owner}@example.invalid`,helper,`${helper}@example.invalid`]);
    await tx.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Teste fictício',$2)",[org,`test-${org}`]);
    await tx.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'professional')",[org,owner,helper]);
    await tx.query("INSERT INTO professionals(id,organization_id,user_id,name,is_active,is_bookable) VALUES($1,$2,$3,'Executor teste',true,true),($4,$2,$5,'Assistente teste',true,true)",[executor,org,owner,assistant,helper]);
    await tx.query("INSERT INTO clients(id,organization_id,name) VALUES($1,$2,'Cliente fictício')",[client,org]);
    await tx.query("INSERT INTO services(id,organization_id,name,duration_minutes,price_in_cents,commission_rate_basis_points,execution_commission_rate_basis_points) VALUES($1,$2,'Serviço fictício',30,10000,1000,2000)",[service,org]);
    await tx.query("INSERT INTO appointments(id,organization_id,client_id,professional_id,service_id,status,starts_at,ends_at,price_in_cents,commission_assistant_id,commission_assistant_share_basis_points) VALUES($1,$2,$3,$4,$5,'scheduled','2099-01-15 10:00','2099-01-15 10:30',10000,$6,2500)",[visit,org,client,executor,service,assistant]);
    const quote=await tx.query("SELECT base_in_cents,rate_basis_points FROM aggenda_execution_sources($1)",[visit]);
    assert.deepEqual(quote.rows,[{base_in_cents:10000,rate_basis_points:2000}]);
    await tx.query("UPDATE appointments SET status='completed' WHERE id=$1",[visit]);
    await tx.query("INSERT INTO retail_sales(id,organization_id,attendance_id,status,subtotal_in_cents,total_in_cents,commission_professional_id) VALUES($1,$2,$3,'pending_payment',10000,10000,$4)",[sale,org,visit,executor]);
    await tx.query("INSERT INTO retail_sale_items(organization_id,sale_id,service_id,product_name,variant_name,quantity,unit_price_in_cents,total_in_cents) VALUES($1,$2,$3,'Serviço','Serviço realizado',1,10000,10000)",[org,sale,service]);
    await tx.query("UPDATE retail_sales SET commission_deduct_fees=true,commission_fee_in_cents=300 WHERE id=$1",[sale]);
    assert.equal((await tx.query("SELECT amount_in_cents FROM commission_entries WHERE sale_id=$1",[sale])).rows[0].amount_in_cents,970);
    await tx.query("SELECT aggenda_sync_sale_commissions($1)",[sale]);
    assert.equal((await tx.query("SELECT amount_in_cents FROM commission_entries WHERE sale_id=$1",[sale])).rows[0].amount_in_cents,970);
    await tx.query("UPDATE retail_sales SET commission_deduct_fees=false,commission_fee_in_cents=null WHERE id=$1",[sale]);
    const rows=await tx.query("SELECT source_type,amount_in_cents FROM commission_entries WHERE organization_id=$1 ORDER BY source_type",[org]);
    assert.deepEqual(rows.rows,[{source_type:"execution_assistant",amount_in_cents:500},{source_type:"execution_executor",amount_in_cents:1500},{source_type:"service",amount_in_cents:1000}]);
    await tx.query("UPDATE appointments SET status='scheduled' WHERE id=$1",[visit]);
    assert.equal((await tx.query("SELECT id FROM commission_entries WHERE organization_id=$1 AND source_type LIKE 'execution_%' AND status='pending'",[org])).rows.length,0);
    assert.equal((await tx.query("SELECT id FROM commission_entries WHERE sale_id=$1 AND status='pending'",[sale])).rows.length,1,"Reopening execution does not cancel the sale commission");
    console.log(JSON.stringify({assessment:true,isolatedMigration:true,historyPreserved:true,independentSaleAndExecution:true,assistantSplit:true,reopening:true,fixtures:"rolled back"}));
  } finally {await tx.query("ROLLBACK");tx.release();}
} catch(error){console.error("Validation failed",error.cause?.code??error.code??error.name,String(error.cause?.message??error.message).replace(/postgres(?:ql)?:\/\/[^\s]+/g,"[redacted]").slice(0,180));process.exitCode=1;}
finally {await pool.end();}
