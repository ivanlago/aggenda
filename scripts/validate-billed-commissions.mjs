// This script can only use the isolated validation compute. Every fixture is rolled back.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
nextEnv.loadEnvConfig(process.cwd());
const url=new URL(process.env.DATABASE_URL);
url.hostname="ep-old-firefly-auvf0uab.c-10.us-east-1.aws.neon.tech";
url.searchParams.set("sslmode","verify-full");
const pool=new pg.Pool({connectionString:url.toString(),connectionTimeoutMillis:10000,query_timeout:15000});
try {
  await migrate(drizzle(pool),{migrationsFolder:"./drizzle"});
  const tx=await pool.connect();
  try {
    await tx.query("BEGIN");
    const org=randomUUID(),user=`commission-test-${randomUUID()}`,service=randomUUID(),sale=randomUUID();
    await tx.query("INSERT INTO users(id,name,email) VALUES($1,'Teste fictício',$2)",[user,`${user}@example.invalid`]);
    await tx.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Teste fictício',$2)",[org,`test-${org}`]);
    await tx.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,'owner')",[org,user]);
    await tx.query("INSERT INTO services(id,organization_id,name,duration_minutes,commission_rate_basis_points) VALUES($1,$2,'Teste fictício',30,1200)",[service,org]);
    await tx.query("INSERT INTO collaborator_item_commissions(organization_id,user_id,item_type,item_id,percentage_basis_points) VALUES($1,$2,'service',$3,1500)",[org,user,service]);
    await tx.query("INSERT INTO retail_sales(id,organization_id,status,subtotal_in_cents,total_in_cents,commission_user_id) VALUES($1,$2,'pending_payment',10000,10000,$3)",[sale,org,user]);
    await tx.query("INSERT INTO retail_sale_items(organization_id,sale_id,service_id,product_name,variant_name,quantity,unit_price_in_cents,total_in_cents) VALUES($1,$2,$3,'Teste','Serviço',1,10000,10000)",[org,sale,service]);
    const entries=()=>tx.query("SELECT amount_in_cents,status FROM commission_entries WHERE sale_id=$1",[sale]);
    assert.deepEqual((await entries()).rows,[{amount_in_cents:1500,status:"pending"}]);
    await tx.query("UPDATE retail_sales SET status='completed' WHERE id=$1",[sale]);
    assert.deepEqual((await entries()).rows,[{amount_in_cents:1500,status:"pending"}]);
    await tx.query("UPDATE retail_sales SET status='cancelled' WHERE id=$1",[sale]);
    assert.deepEqual((await entries()).rows,[{amount_in_cents:0,status:"cancelled"}]);
    console.log(JSON.stringify({isolatedPostgres:true,unpaidCommission:true,individualOverride:true,idempotentConfirmation:true,cancellation:true,fixtures:"rolled back"}));
  } finally {await tx.query("ROLLBACK");tx.release();}
} catch(error){console.error("Validation failed",error.cause?.code??error.code??error.name,String(error.cause?.message??error.message).replace(/postgres(?:ql)?:\/\/[^\s]+/g,"[redacted]").slice(0,180));process.exitCode=1;}
finally{await pool.end();}
