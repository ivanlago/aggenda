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

test("execution commissions split once, preserve paid history and allocate net package cents exactly",async()=>{
const pg=new PGlite();try {
    const tables={appointments:schema.appointments,organization_members:schema.organizationMembers,client_packages:schema.clientPackages,client_package_balances:schema.clientPackageBalances,package_usages:schema.packageUsages,attendance_package_items:schema.attendancePackageItems,users:schema.users,organizations:schema.organizations,professionals:schema.professionals,services:schema.services,service_packages:schema.servicePackages,catalog_kits:schema.catalogKits,retail_product_variants:schema.retailProductVariants,retail_sales:schema.retailSales,retail_sale_items:schema.retailSaleItems,retail_sale_payments:schema.retailSalePayments,commission_entries:schema.commissionEntries};
    const added:Record<string,string[]>={appointments:["commission_assistant_id","commission_assistant_share_basis_points","execution_commission_eligible"],organizations:["commission_policy_version"],services:["commission_rate_basis_points","execution_commission_rate_basis_points"],service_packages:["commission_rate_basis_points","execution_commission_rate_basis_points"],catalog_kits:["commission_rate_basis_points"],retail_sales:["commission_billed_at"],retail_sale_items:["kit_id","commission_rate_basis_points"]};
    for(const [name,table] of Object.entries(tables)){
      const columns=Object.values(getTableColumns(table)).filter(c=>!added[name]?.includes(c.name)).map(c=>{
        const type=c.enumValues?"text":c.getSQLType();
        const fallback=c.primary&&type==="uuid"?" DEFAULT gen_random_uuid()":["created_at","updated_at","sold_at"].includes(c.name)?" DEFAULT now()":typeof c.default==="string"?` DEFAULT '${c.default.replaceAll("'","''")}'`:typeof c.default==="number"||typeof c.default==="boolean"?` DEFAULT ${c.default}`:"";
        return `"${c.name}" ${type}${c.primary?" PRIMARY KEY":""}${fallback}`;
      });
      await pg.exec(`CREATE TABLE "${name}" (${columns.join(",")})`);
    }

await pg.exec("CREATE UNIQUE INDEX commission_entries_source_unique ON commission_entries(organization_id,source_key)");
await pg.exec(await readFile("drizzle/0102_billed_item_commissions.sql","utf8"));
await pg.exec(await readFile("drizzle/0105_execution_commissions.sql","utf8"));
const org=randomUUID(),other=randomUUID(),executor=randomUUID(),assistant=randomUUID(),outsider=randomUUID(),service=randomUUID(),visit=randomUUID();
await pg.query("INSERT INTO organizations(id,name,timezone) VALUES($1,'Teste','America/Bahia'),($2,'Outra','America/Bahia')",[org,other]);
await pg.query("INSERT INTO users(id,name) VALUES('executor','Executor'),('assistant','Assistente'),('outside','Outro')");
for(const [id,user,tenant] of [[executor,'executor',org],[assistant,'assistant',org],[outsider,'outside',other]]){
await pg.query("INSERT INTO professionals(id,organization_id,user_id,name,is_active,is_bookable) VALUES($1,$2,$3,$3,true,true)",[id,tenant,user]);
await pg.query("INSERT INTO organization_members(organization_id,user_id) VALUES($1,$2)",[tenant,user]);}
await pg.query("INSERT INTO services(id,organization_id,name,price_in_cents,execution_commission_rate_basis_points) VALUES($1,$2,'Serviço',10000,2000)",[service,org]);
await pg.query("INSERT INTO appointments(id,organization_id,professional_id,service_id,status,price_in_cents,commission_assistant_id,commission_assistant_share_basis_points) VALUES($1,$2,$3,$4,'scheduled',10000,$5,2500)",[visit,org,executor,service,assistant]);
await pg.query("UPDATE appointments SET status='completed' WHERE id=$1",[visit]);
const rows=(await pg.query<{id:string;source_type:string;amount_in_cents:number}>("SELECT id,source_type,amount_in_cents FROM commission_entries ORDER BY source_type")).rows;
assert.deepEqual(rows.map(r=>[r.source_type,r.amount_in_cents]),[['execution_assistant',500],['execution_executor',1500]]);
await pg.query("UPDATE appointments SET status='completed' WHERE id=$1",[visit]);assert.equal((await pg.query("SELECT id FROM commission_entries")).rows.length,2);
await assert.rejects(pg.query("UPDATE appointments SET commission_assistant_share_basis_points=5000 WHERE id=$1",[visit]),/já foi registrada/);
const paid=rows.find(r=>r.source_type==='execution_executor')!.id;
await pg.query("UPDATE commission_entries SET status='paid' WHERE id=$1",[paid]);
await pg.query("UPDATE appointments SET status='scheduled' WHERE id=$1",[visit]);
assert.equal((await pg.query<{amount_in_cents:number}>("SELECT amount_in_cents FROM commission_entries WHERE original_entry_id=$1 AND status='pending'",[paid])).rows[0].amount_in_cents,-1500);
await pg.query("UPDATE appointments SET status='completed' WHERE id=$1",[visit]);
assert.equal((await pg.query("SELECT id FROM commission_entries WHERE original_entry_id=$1 AND status='pending'",[paid])).rows.length,0);
await assert.rejects(pg.query("INSERT INTO appointments(organization_id,professional_id,service_id,commission_assistant_id,status) VALUES($1,$2,$3,$4,'scheduled')",[org,executor,service,outsider]),/assistente ativo/);
const model=randomUUID(),pack=randomUUID(),balance=randomUUID();
await pg.query("INSERT INTO service_packages(id,organization_id,name,price_in_cents,execution_commission_rate_basis_points) VALUES($1,$2,'Pacote',20000,10000)",[model,org]);
await pg.query("INSERT INTO client_packages(id,organization_id,package_id,price_in_cents,status) VALUES($1,$2,$3,10001,'active')",[pack,org,model]);
await pg.query("INSERT INTO client_package_balances(id,organization_id,client_package_id,service_id,total_quantity) VALUES($1,$2,$3,$4,3)",[balance,org,pack,service]);
for(let i=0;i<3;i++){
const id=randomUUID();await pg.query("INSERT INTO appointments(id,organization_id,professional_id,service_id,status) VALUES($1,$2,$3,$4,'scheduled')",[id,org,executor,service]);
await pg.query("INSERT INTO package_usages(organization_id,appointment_id,client_package_id,balance_id,quantity,status) VALUES($1,$2,$3,$4,1,'reserved')",[org,id,pack,balance]);
await pg.query("UPDATE appointments SET status='completed' WHERE id=$1",[id]);
assert.equal((await pg.query("SELECT id FROM execution_commission_snapshots WHERE appointment_id=$1",[id])).rows.length,0,'reserved package is not executed');
await pg.query("UPDATE package_usages SET status='consumed' WHERE appointment_id=$1",[id]);}
const sale=randomUUID();await pg.query("INSERT INTO retail_sales(id,organization_id,attendance_id,status,total_in_cents,commission_user_id) VALUES($1,$2,$3,'pending_payment',10000,'executor')",[sale,org,visit]);
await pg.query("INSERT INTO retail_sale_items(organization_id,sale_id,service_id,product_name,variant_name,quantity,total_in_cents) VALUES($1,$2,$3,'Serviço','Serviço realizado',1,10000)",[org,sale,service]);
await pg.query("UPDATE retail_sales SET status='completed' WHERE id=$1",[sale]);
const bases=(await pg.query<{base_in_cents:number}>("SELECT base_in_cents FROM execution_commission_snapshots WHERE client_package_id=$1 ORDER BY created_at,id",[pack])).rows.map(r=>r.base_in_cents);
assert.equal(bases.reduce((a,b)=>a+b,0),10001);assert.deepEqual(bases.sort(),[3333,3334,3334]);
const individualVisit=randomUUID();
await pg.query("INSERT INTO collaborator_item_commissions(organization_id,user_id,item_type,item_id,percentage_basis_points,execution_percentage_basis_points) VALUES($1,'executor','service',$2,NULL,1500)",[org,service]);
assert.equal((await pg.query<{aggenda_item_commission_rate:number}>("SELECT aggenda_item_commission_rate($1,'executor','service',$2)",[org,service])).rows[0].aggenda_item_commission_rate,0,'execution-only override keeps the sale default');
await pg.query("INSERT INTO appointments(id,organization_id,professional_id,service_id,status,price_in_cents) VALUES($1,$2,$3,$4,'scheduled',10000)",[individualVisit,org,executor,service]);
assert.deepEqual((await pg.query("SELECT base_in_cents,rate_basis_points FROM aggenda_execution_sources($1)",[individualVisit])).rows,[{base_in_cents:10000,rate_basis_points:1500}]);
await pg.query("UPDATE appointments SET status='completed' WHERE id=$1",[individualVisit]);
assert.equal((await pg.query<{total_in_cents:number}>("SELECT total_in_cents FROM execution_commission_snapshots WHERE appointment_id=$1",[individualVisit])).rows[0].total_in_cents,1500);
const state=globalThis as unknown as {executionTestDb:unknown;executionTestOrg:string;executionTestItem:string};
state.executionTestDb=drizzle(pg,{schema});state.executionTestOrg=org;state.executionTestItem=service;
const bundle=await build({entryPoints:["src/actions/collaborator-commissions.ts"],bundle:true,write:false,format:"cjs",platform:"node",packages:"external",plugins:[{name:"execution-settings",setup(builder){
const mocks:Record<string,string>={"@/db":"export const db=globalThis.executionTestDb","@/lib/session":"export async function requireOrganization(){return {organization:{id:globalThis.executionTestOrg,role:'owner'},session:{user:{id:'executor'}}}}","@/lib/audit":"export async function writeAuditLog(){}","next/cache":"export function revalidatePath(){}","@/lib/commission-catalog":"export async function commissionCatalog(){return [{id:globalThis.executionTestItem,type:'service',rate:0,executionRate:2000}]}"};
builder.onResolve({filter:/.*/},args=>mocks[args.path]?{path:args.path,namespace:'execution-settings'}:undefined);builder.onLoad({filter:/.*/,namespace:'execution-settings'},args=>({contents:mocks[args.path],loader:'js'}));}}]});
const actionModule={exports:{} as {saveCollaboratorCommissions:(form:FormData)=>Promise<unknown>}};
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),actionModule,actionModule.exports);
const form=new FormData();form.set('userId','executor');form.set(`commission:service:${service}`,'');form.set(`executionCommission:service:${service}`,'25');
await actionModule.exports.saveCollaboratorCommissions(form);
assert.deepEqual((await pg.query('SELECT percentage_basis_points,execution_percentage_basis_points FROM collaborator_item_commissions WHERE item_id=$1',[service])).rows,[{percentage_basis_points:null,execution_percentage_basis_points:2500}]);
form.set(`executionCommission:service:${service}`,'0');await actionModule.exports.saveCollaboratorCommissions(form);
assert.equal((await pg.query<{execution_percentage_basis_points:number}>('SELECT execution_percentage_basis_points FROM collaborator_item_commissions WHERE item_id=$1',[service])).rows[0].execution_percentage_basis_points,0,'updating an existing override supports explicit zero');
form.set('userId','outside');assert.ok((await actionModule.exports.saveCollaboratorCommissions(form) as {error:string}).error,'foreign members cannot be configured');
}finally{await pg.close();}});
