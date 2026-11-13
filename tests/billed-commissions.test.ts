import { build } from "esbuild";
import { createRequire } from "node:module";
import { drizzle } from "drizzle-orm/pglite";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { getTableColumns } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { commissionAssessment, parseCommissionFee } from "../src/lib/commission-assessment";
import { parseCommissionPercentage } from "../src/lib/item-commission";

test("percentage parsing accepts decimal percent and rejects malformed or out of range values",()=>{
  assert.equal(parseCommissionPercentage("12,35"),1235);
  assert.equal(parseCommissionPercentage("0"),0);
  for(const invalid of ["-1","100.01","Infinity","abc","1.234"]) assert.throws(()=>parseCommissionPercentage(invalid));
});

test("billed commissions: unpaid sale, item override, snapshot, package once, refund, paid adjustment and history",async()=>{
  const pg=new PGlite();
  try {
    const tables={audit_logs:schema.auditLogs,users:schema.users,organizations:schema.organizations,professionals:schema.professionals,services:schema.services,service_packages:schema.servicePackages,catalog_kits:schema.catalogKits,retail_product_variants:schema.retailProductVariants,retail_sales:schema.retailSales,retail_sale_items:schema.retailSaleItems,retail_sale_payments:schema.retailSalePayments,commission_entries:schema.commissionEntries};
    const added:Record<string,string[]>={organizations:["commission_policy_version"],services:["commission_rate_basis_points"],service_packages:["commission_rate_basis_points"],catalog_kits:["commission_rate_basis_points"],retail_sales:["commission_billed_at","commission_deduct_discount","commission_deduct_fees","commission_fee_in_cents","commission_deduct_cost","commission_cost_in_cents"],retail_sale_items:["kit_id","commission_rate_basis_points"]};
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
    await pg.exec(await readFile("drizzle/0106_commission_sale_assessment.sql","utf8"));
    await pg.exec(await readFile("drizzle/0107_commission_cost_assessment.sql","utf8"));
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
    await pg.query("UPDATE retail_sale_items SET discount_in_cents=1000 WHERE id=$1",[line]);
    await pg.query("UPDATE retail_sales SET commission_deduct_discount=false WHERE id=$1",[sale]);
    assert.equal((await entries())[0].amount_in_cents,1650);
    await pg.query("UPDATE retail_sales SET commission_deduct_discount=true,commission_deduct_fees=true,commission_fee_in_cents=300 WHERE id=$1",[sale]);
    assert.equal((await entries())[0].amount_in_cents,1455);
    await pg.query("SELECT aggenda_sync_sale_commissions($1)",[sale]);
    assert.equal((await entries())[0].amount_in_cents,1455,"fee is never subtracted twice");
    assert.equal((await pg.query<{base_amount_in_cents:number}>("SELECT base_amount_in_cents FROM commission_entries WHERE sale_id=$1",[sale])).rows[0].base_amount_in_cents,9700);
    await assert.rejects(pg.query("UPDATE retail_sales SET commission_fee_in_cents=10001 WHERE id=$1",[sale]));
    await pg.query("UPDATE retail_sales SET commission_deduct_discount=true,commission_deduct_fees=false,commission_fee_in_cents=null WHERE id=$1",[sale]);
    const payment=randomUUID();await pg.query("INSERT INTO retail_sale_payments(id,organization_id,sale_id,refunded_in_cents) VALUES($1,$2,$3,5000)",[payment,org,sale]);
    assert.equal((await entries())[0].amount_in_cents,750,"partial refund reverses proportionally");
    const original=(await entries())[0].id;
    await pg.query("UPDATE commission_entries SET status='paid' WHERE id=$1",[original]);
    await assert.rejects(pg.query("UPDATE retail_sales SET commission_deduct_discount=false WHERE id=$1",[sale]),/comissão paga/);
    await pg.query("UPDATE retail_sales SET status='cancelled' WHERE id=$1",[sale]);
    rows=await entries();assert.equal(rows.find(x=>x.id===original)?.amount_in_cents,750);assert.equal(rows.find(x=>x.original_entry_id===original)?.amount_in_cents,-750);
    await pg.query("SELECT aggenda_sync_sale_commissions($1)",[sale]);assert.equal((await entries()).length,2,"replay never duplicates adjustments");
    for(const [column,id,amount,expected] of [["package_id",pack,10000,2000],["kit_id",kit,10000,500]] as const){
      const next=randomUUID();await pg.query("INSERT INTO retail_sales(id,organization_id,status,total_in_cents,commission_user_id) VALUES($1,$2,'completed',$3,'seller')",[next,org,amount]);
      await pg.query(`INSERT INTO retail_sale_items(organization_id,sale_id,${column},product_name,variant_name,quantity,total_in_cents) VALUES($1,$2,$3,'Item','Item',1,$4)`,[org,next,id,amount]);
      const result=await pg.query<{amount_in_cents:number}>("SELECT amount_in_cents FROM commission_entries WHERE sale_id=$1",[next]);assert.deepEqual(result.rows.map(x=>x.amount_in_cents),[expected]);
    }
    const mixed=randomUUID(), first="10000000-0000-4000-8000-000000000001", second="20000000-0000-4000-8000-000000000001";
    await pg.query("INSERT INTO retail_sales(id,organization_id,status,total_in_cents,commission_user_id) VALUES($1,$2,'completed',9000,'seller')",[mixed,org]);
    await pg.query("INSERT INTO retail_sale_items(id,organization_id,sale_id,package_id,product_name,quantity,total_in_cents,discount_in_cents) VALUES($1,$2,$3,$4,'Pacote',1,6000,1000)",[first,org,mixed,pack]);
    await pg.query("INSERT INTO retail_sale_items(id,organization_id,sale_id,kit_id,product_name,quantity,total_in_cents,discount_in_cents) VALUES($1,$2,$3,$4,'Kit',1,3000,0)",[second,org,mixed,kit]);
    await pg.query("UPDATE retail_sales SET commission_deduct_fees=true,commission_fee_in_cents=1 WHERE id=$1",[mixed]);
    let mixedRows=(await pg.query<{sale_item_id:string;base_amount_in_cents:number;amount_in_cents:number}>("SELECT sale_item_id,base_amount_in_cents,amount_in_cents FROM commission_entries WHERE sale_id=$1 ORDER BY sale_item_id",[mixed])).rows;
    const preview=commissionAssessment([{id:first,name:"Pacote",net:6000,discount:1000,rate:2000},{id:second,name:"Kit",net:3000,discount:0,rate:500}],true,1);
    assert.deepEqual(mixedRows.map(x=>[x.base_amount_in_cents,x.amount_in_cents]),preview.map(x=>[x.base,x.commission]));
    await pg.query("UPDATE retail_sales SET commission_deduct_discount=false,commission_fee_in_cents=300 WHERE id=$1",[mixed]);
    mixedRows=(await pg.query<{sale_item_id:string;base_amount_in_cents:number;amount_in_cents:number}>("SELECT sale_item_id,base_amount_in_cents,amount_in_cents FROM commission_entries WHERE sale_id=$1 ORDER BY sale_item_id",[mixed])).rows;
    assert.deepEqual(mixedRows.map(x=>[x.base_amount_in_cents,x.amount_in_cents]),[[6800,1360],[2900,145]]);
    await pg.query("UPDATE retail_sales SET commission_deduct_cost=true,commission_cost_in_cents=900 WHERE id=$1",[mixed]);
    assert.deepEqual((await pg.query<{base_amount_in_cents:number;amount_in_cents:number}>("SELECT base_amount_in_cents,amount_in_cents FROM commission_entries WHERE sale_id=$1 ORDER BY sale_item_id",[mixed])).rows.map(x=>[x.base_amount_in_cents,x.amount_in_cents]),[[6200,1240],[2600,130]]);
    await pg.query("SELECT aggenda_sync_sale_commissions($1)",[mixed]);
    assert.equal((await pg.query<{amount:number}>("SELECT sum(amount_in_cents)::int AS amount FROM commission_entries WHERE sale_id=$1",[mixed])).rows[0].amount,1370,"cost is not deducted twice");
    await assert.rejects(pg.query("UPDATE retail_sales SET commission_cost_in_cents=-1 WHERE id=$1",[mixed]));
    await pg.query("UPDATE retail_sales SET commission_deduct_cost=false,commission_cost_in_cents=null WHERE id=$1",[mixed]);
    await pg.exec(await readFile("drizzle/0108_disable_commission_cost.sql","utf8"));
    await assert.rejects(pg.query("UPDATE retail_sales SET commission_deduct_cost=true,commission_cost_in_cents=0 WHERE id=$1",[mixed]),/commission_cost_disabled/);
    const state=globalThis as unknown as {assessmentTestDb:unknown;assessmentTestOrg:string};
    state.assessmentTestDb=drizzle(pg,{schema});state.assessmentTestOrg=org;
    const bundle=await build({entryPoints:["src/actions/commissions.ts"],bundle:true,write:false,format:"cjs",platform:"node",packages:"external",plugins:[{name:"assessment-action",setup(builder){
      const mocks:Record<string,string>={"@/db":"export const db=globalThis.assessmentTestDb","@/lib/session":"export async function requireOrganization(){return {organization:{id:globalThis.assessmentTestOrg,role:'owner',timezone:'America/Bahia'},session:{user:{id:'seller'}}}}","next/cache":"export function revalidatePath(){}"};
      builder.onResolve({filter:/./},args=>mocks[args.path]?{path:args.path,namespace:"assessment-action"}:undefined);
      builder.onLoad({filter:/./,namespace:"assessment-action"},args=>({contents:mocks[args.path],loader:"js"}));
    }}]});
    const actionModule={exports:{} as {applySaleCommissionAssessment:(form:FormData)=>Promise<{error?:string}|undefined>}};
    new Function("require","module","exports",bundle.outputFiles[0].text)(createRequire(import.meta.url),actionModule,actionModule.exports);
    const form=new FormData();form.set("saleId",mixed);form.set("deductFees","on");
    assert.ok((await actionModule.exports.applySaleCommissionAssessment(form))?.error,"unknown fee cannot be applied as zero");
    form.set("fee","3,00");form.set("deductDiscount","on");
    form.set("deductCost","on");
    assert.ok((await actionModule.exports.applySaleCommissionAssessment(form))?.error,"cost requires an explicit value");
    form.set("cost","0,00");
    assert.ok((await actionModule.exports.applySaleCommissionAssessment(form))?.error,"cost deduction remains disabled even when a value is supplied");
    form.delete("deductCost");form.delete("cost");
    state.assessmentTestOrg=other;
    assert.ok((await actionModule.exports.applySaleCommissionAssessment(form))?.error,"foreign sale is rejected");
    state.assessmentTestOrg=org;
    assert.equal(await actionModule.exports.applySaleCommissionAssessment(form),undefined);
    const audit=(await pg.query<{details:{after:{fee:number};result:unknown[]}}>("SELECT details FROM audit_logs WHERE entity_id=$1",[mixed])).rows;
    assert.equal(audit.length,1);assert.equal(audit[0].details.after.fee,300);assert.equal(audit[0].details.result.length,2);
    await pg.query("UPDATE commission_entries SET status='paid' WHERE sale_id=$1",[mixed]);
    assert.ok((await actionModule.exports.applySaleCommissionAssessment(form))?.error,"paid commissions are frozen in action as well as database");
    await assert.rejects(pg.query("UPDATE retail_sales SET commission_cost_in_cents=1 WHERE id=$1",[mixed]),/comissão paga/);
    await pg.query("INSERT INTO retail_sale_payments(organization_id,sale_id,refunded_in_cents) VALUES($1,$2,4500)",[org,mixed]);
    assert.deepEqual((await pg.query<{amount_in_cents:number}>("SELECT amount_in_cents FROM commission_entries WHERE sale_id=$1 AND original_entry_id IS NOT NULL ORDER BY sale_item_id",[mixed])).rows.map(x=>x.amount_in_cents),[-580,-72],"refund adjustments use the assessed net commission and preserve paid rows");
    const outside=randomUUID();await pg.query("INSERT INTO retail_sales(id,organization_id,status,total_in_cents,commission_user_id) VALUES($1,$2,'completed',10000,'seller')",[outside,other]);
    await assert.rejects(pg.query("INSERT INTO retail_sale_items(organization_id,sale_id,service_id,product_name,total_in_cents) VALUES($1,$2,$3,'Fora',10000)",[other,outside,service]));
    const zero=randomUUID();await pg.query("UPDATE collaborator_item_commissions SET percentage_basis_points=0 WHERE organization_id=$1",[org]);
    await pg.query("INSERT INTO retail_sales(id,organization_id,total_in_cents,commission_user_id) VALUES($1,$2,10000,'seller')",[zero,org]);
    await pg.query("INSERT INTO retail_sale_items(organization_id,sale_id,service_id,product_name,total_in_cents) VALUES($1,$2,$3,'Zero',10000)",[org,zero,service]);
    assert.equal((await pg.query("SELECT id FROM commission_entries WHERE sale_id=$1",[zero])).rows.length,0);
  } finally {await pg.close();}
});

test("assessment preview: discounts, mixed rates, exact fee allocation, refunds and missing fees",()=>{
  const rows=[{id:"a",name:"Produto",net:6000,discount:1000,rate:1000},{id:"b",name:"Serviço",net:3000,discount:0,rate:2000}];
  assert.deepEqual(commissionAssessment(rows,true,300).map(x=>[x.base,x.commission]),[[5800,580],[2900,580]]);
  assert.deepEqual(commissionAssessment(rows,false,0).map(x=>x.commission),[700,600]);
  assert.deepEqual(commissionAssessment(rows,true,300,4500).map(x=>x.commission),[290,290]);
  assert.equal(commissionAssessment(rows,true,1).reduce((sum,x)=>sum+x.fee,0),1);
  assert.equal(commissionAssessment([...rows].reverse(),true,1)[0].id,"a");
  assert.equal(parseCommissionFee("3,45"),345);
  assert.equal(parseCommissionFee("0"),0);
  for(const value of ["", "-1", "1.234", "1e2", "Infinity"]) assert.throws(()=>parseCommissionFee(value));
  assert.throws(()=>commissionAssessment(rows,true,9001));
});
