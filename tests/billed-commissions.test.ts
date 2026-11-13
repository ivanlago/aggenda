import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { getTableColumns } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { parseCommissionPercentage } from "../src/lib/item-commission";

test("percentage parsing accepts decimal percent and rejects malformed or out of range values",()=>{
  assert.equal(parseCommissionPercentage("12,35"),1235);
  assert.equal(parseCommissionPercentage("0"),0);
  for(const invalid of ["-1","100.01","Infinity","abc","1.234"]) assert.throws(()=>parseCommissionPercentage(invalid));
});

test("billed commissions: unpaid sale, item override, snapshot, package once, refund, paid adjustment and history",async()=>{
  const pg=new PGlite();
  try {
    const tables={users:schema.users,organizations:schema.organizations,professionals:schema.professionals,services:schema.services,service_packages:schema.servicePackages,catalog_kits:schema.catalogKits,retail_product_variants:schema.retailProductVariants,retail_sales:schema.retailSales,retail_sale_items:schema.retailSaleItems,retail_sale_payments:schema.retailSalePayments,commission_entries:schema.commissionEntries};
    const added:Record<string,string[]>={organizations:["commission_policy_version"],services:["commission_rate_basis_points"],service_packages:["commission_rate_basis_points"],catalog_kits:["commission_rate_basis_points"],retail_sales:["commission_billed_at"],retail_sale_items:["kit_id","commission_rate_basis_points"]};
    for(const [name,table] of Object.entries(tables)){
      const columns=Object.values(getTableColumns(table)).filter(c=>!added[name]?.includes(c.name)).map(c=>{
        const type=c.enumValues?"text":c.getSQLType();
        const fallback=c.primary&&type==="uuid"?" DEFAULT gen_random_uuid()":["created_at","updated_at","sold_at"].includes(c.name)?" DEFAULT now()":typeof c.default==="string"?` DEFAULT '${c.default.replaceAll("'","''")}'`:typeof c.default==="number"||typeof c.default==="boolean"?` DEFAULT ${c.default}`:"";
        return `"${c.name}" ${type}${c.primary?" PRIMARY KEY":""}${fallback}`;
      });
      await pg.exec(`CREATE TABLE "${name}" (${columns.join(",")})`);
    }
    await pg.exec("CREATE UNIQUE INDEX commission_entries_source_unique ON commission_entries(organization_id,source_key)");
    const org=randomUUID(),other=randomUUID(),service=randomUUID(),pack=randomUUID(),kit=randomUUID(),sale=randomUUID(),oldSale=randomUUID();
    await pg.query("INSERT INTO users(id,name) VALUES ('seller','Teste')");
    await pg.query("INSERT INTO organizations(id,name) VALUES ($1,'Teste'),($2,'Outra')",[org,other]);
    await pg.query("INSERT INTO retail_sales(id,organization_id,status,total_in_cents) VALUES($1,$2,'completed',10000)",[oldSale,org]);
    await pg.exec(await readFile("drizzle/0102_billed_item_commissions.sql","utf8"));
    assert.equal((await pg.query<{commission_billed_at:unknown}>("SELECT commission_billed_at FROM retail_sales WHERE id=$1",[oldSale])).rows[0].commission_billed_at,null);
    await pg.query("INSERT INTO services(id,organization_id,name,commission_rate_basis_points) VALUES($1,$2,'Serviço',1000)",[service,org]);
    await pg.query("INSERT INTO service_packages(id,organization_id,name,commission_rate_basis_points) VALUES($1,$2,'Pacote',2000)",[pack,org]);
    await pg.query("INSERT INTO catalog_kits(id,organization_id,name,commission_rate_basis_points) VALUES($1,$2,'Kit',500)",[kit,org]);
    await pg.query("INSERT INTO collaborator_item_commissions(organization_id,user_id,item_type,item_id,percentage_basis_points) VALUES($1,'seller','service',$2,1500)",[org,service]);
    await pg.query("INSERT INTO retail_sales(id,organization_id,status,total_in_cents,commission_user_id) VALUES($1,$2,'pending_payment',10000,'seller')",[sale,org]);
    const line=randomUUID();
    await pg.query("INSERT INTO retail_sale_items(id,organization_id,sale_id,service_id,product_name,variant_name,quantity,total_in_cents) VALUES($1,$2,$3,$4,'Serviço','Serviço',1,10000)",[line,org,sale,service]);
    const entries=async()=> (await pg.query<{id:string;amount_in_cents:number;status:string;source_type:string;original_entry_id:string|null}>("SELECT * FROM commission_entries WHERE sale_id=$1 ORDER BY created_at,id",[sale])).rows;
    let rows=await entries();assert.equal(rows.length,1);assert.equal(rows[0].amount_in_cents,1500);assert.equal(rows[0].status,"pending");
    await pg.query("UPDATE collaborator_item_commissions SET percentage_basis_points=9000 WHERE organization_id=$1",[org]);
    await pg.query("SELECT aggenda_sync_sale_commissions($1)",[sale]);
    assert.equal((await entries())[0].amount_in_cents,1500,"old sale freezes its percentage");
    await pg.query("UPDATE retail_sales SET status='completed' WHERE id=$1",[sale]);
    assert.equal((await entries()).length,1,"payment confirmation is idempotent");
    const payment=randomUUID();await pg.query("INSERT INTO retail_sale_payments(id,organization_id,sale_id,refunded_in_cents) VALUES($1,$2,$3,5000)",[payment,org,sale]);
    assert.equal((await entries())[0].amount_in_cents,750,"partial refund reverses proportionally");
    const original=(await entries())[0].id;
    await pg.query("UPDATE commission_entries SET status='paid' WHERE id=$1",[original]);
    await pg.query("UPDATE retail_sales SET status='cancelled' WHERE id=$1",[sale]);
    rows=await entries();assert.equal(rows.find(x=>x.id===original)?.amount_in_cents,750);assert.equal(rows.find(x=>x.original_entry_id===original)?.amount_in_cents,-750);
    await pg.query("SELECT aggenda_sync_sale_commissions($1)",[sale]);assert.equal((await entries()).length,2,"replay never duplicates adjustments");
    for(const [column,id,amount,expected] of [["package_id",pack,10000,2000],["kit_id",kit,10000,500]] as const){
      const next=randomUUID();await pg.query("INSERT INTO retail_sales(id,organization_id,status,total_in_cents,commission_user_id) VALUES($1,$2,'completed',$3,'seller')",[next,org,amount]);
      await pg.query(`INSERT INTO retail_sale_items(organization_id,sale_id,${column},product_name,variant_name,quantity,total_in_cents) VALUES($1,$2,$3,'Item','Item',1,$4)`,[org,next,id,amount]);
      const result=await pg.query<{amount_in_cents:number}>("SELECT amount_in_cents FROM commission_entries WHERE sale_id=$1",[next]);assert.deepEqual(result.rows.map(x=>x.amount_in_cents),[expected]);
    }
    const outside=randomUUID();await pg.query("INSERT INTO retail_sales(id,organization_id,status,total_in_cents,commission_user_id) VALUES($1,$2,'completed',10000,'seller')",[outside,other]);
    await assert.rejects(pg.query("INSERT INTO retail_sale_items(organization_id,sale_id,service_id,product_name,total_in_cents) VALUES($1,$2,$3,'Fora',10000)",[other,outside,service]));
    const zero=randomUUID();await pg.query("UPDATE collaborator_item_commissions SET percentage_basis_points=0 WHERE organization_id=$1",[org]);
    await pg.query("INSERT INTO retail_sales(id,organization_id,total_in_cents,commission_user_id) VALUES($1,$2,10000,'seller')",[zero,org]);
    await pg.query("INSERT INTO retail_sale_items(organization_id,sale_id,service_id,product_name,total_in_cents) VALUES($1,$2,$3,'Zero',10000)",[org,zero,service]);
    assert.equal((await pg.query("SELECT id FROM commission_entries WHERE sale_id=$1",[zero])).rows.length,0);
  } finally {await pg.close();}
});
