import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import type { db } from "../src/db";
import * as schema from "../src/db/schema";
import { CommissionRepository } from "../src/lib/commission-repository";
import { commissionAmount, packageSessionBase } from "../src/lib/commission-beneficiary";

test("commission math uses net cents, fixed quantities and exact package allocation",()=>{
  assert.equal(commissionAmount(9000,"percentage",1000),900);
  assert.equal(commissionAmount(9000,"fixed",2500,3),7500);
  assert.throws(()=>commissionAmount(100,"percentage",10001));
  assert.deepEqual([0,1,2].map(offset=>packageSessionBase(10000,3,offset,1)),[3334,3333,3333]);
});

test("actual commission actions reject users without financial management before touching data",async()=>{
  const output=await build({entryPoints:["src/actions/commissions.ts"],bundle:true,write:false,format:"cjs",platform:"node",packages:"external",plugins:[{name:"commission-auth",setup(builder){
    const mocks:Record<string,string>={"@/db":"export const db=new Proxy({},{get(){throw new Error('Database must not be accessed')}});","@/lib/session":"export async function requireOrganization(){return {session:{user:{id:'viewer'}},organization:{id:'outside',role:'viewer',timezone:'America/Bahia'}}}","next/cache":"export function revalidatePath(){}"};
    builder.onResolve({filter:/./},args=>mocks[args.path]?{path:args.path,namespace:"commission-auth"}:undefined);
    builder.onLoad({filter:/./,namespace:"commission-auth"},args=>({contents:mocks[args.path],loader:"js"}));
  }}]});
  const exported={exports:{} as Record<string,(data:FormData)=>Promise<unknown>>};
  new Function("require","module","exports",output.outputFiles[0].text)(createRequire(import.meta.url),exported,exported.exports);
  for(const name of ["saveCommissionRule","deactivateCommissionRule","calculateCommissions","payCommissions","reverseCommissionPayment","assignSaleCommissionBeneficiary"]) await assert.rejects(exported.exports[name](new FormData()),error=>error instanceof Error&&!error.message.includes("Database must"));
});

test("commission migration, unified ledger, settlement, replay, refund adjustments and reversal against PostgreSQL",async()=>{
  const pg=new PGlite();
  try {
    const omitted:Record<string,string[]>={commission_entries:["beneficiary_user_id","sale_id","sale_item_id","source_key","source_type","description","calculation_type","calculation_value","payment_id","original_entry_id"],commission_rules:["beneficiary_user_id","source_type","variant_id"],retail_sales:["commission_professional_id","commission_user_id"]};
    const tables={users:schema.users,organizations:schema.organizations,organization_members:schema.organizationMembers,professionals:schema.professionals,clients:schema.clients,services:schema.services,retail_product_variants:schema.retailProductVariants,retail_sales:schema.retailSales,retail_sale_items:schema.retailSaleItems,financial_entries:schema.financialEntries,financial_accounts:schema.financialAccounts,payment_charges:schema.paymentCharges,appointments:schema.appointments,package_usages:schema.packageUsages,attendance_package_items:schema.attendancePackageItems,client_packages:schema.clientPackages,client_package_balances:schema.clientPackageBalances,audit_logs:schema.auditLogs,commission_rules:schema.commissionRules,commission_entries:schema.commissionEntries};
    for(const [name,table] of Object.entries(tables)){
      const columns=Object.values(getTableColumns(table)).filter(column=>!omitted[name]?.includes(column.name)).map(column=>{
        const type=column.enumValues?"text":column.getSQLType();
        let fallback="";
        if(column.primary&&type==="uuid") fallback=" DEFAULT gen_random_uuid()";
        else if(["created_at","updated_at","sold_at","reserved_at"].includes(column.name)) fallback=" DEFAULT now()";
        else if(typeof column.default==="string") fallback=` DEFAULT '${column.default.replaceAll("'","''")}'`;
        else if(typeof column.default==="number"||typeof column.default==="boolean") fallback=` DEFAULT ${column.default}`;
        return `"${column.name}" ${type}${column.primary?" PRIMARY KEY":""}${fallback}`;
      });
      await pg.exec(`CREATE TABLE "${name}" (${columns.join(",")})`);
    }
    await pg.exec("ALTER TABLE commission_rules ADD CONSTRAINT commission_rules_professional_id_professionals_id_fk FOREIGN KEY(professional_id) REFERENCES professionals(id); ALTER TABLE commission_rules ADD CONSTRAINT commission_rules_service_id_services_id_fk FOREIGN KEY(service_id) REFERENCES services(id); CREATE UNIQUE INDEX commission_entries_appointment_unique ON commission_entries(appointment_id)");
    const org=randomUUID(),outside=randomUUID(),professional=randomUUID(),foreignProfessional=randomUUID(),service=randomUUID(),account=randomUUID(),foreignAccount=randomUUID(),visit=randomUUID();
    await pg.query("INSERT INTO users(id,name) VALUES ('cashier','Operador teste'),('seller','Beneficiário teste')");
    await pg.query("INSERT INTO organizations(id,name) VALUES ($1,'Clínica teste'),($2,'Outra clínica')",[org,outside]);
    await pg.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES ($1,'seller','staff'),($1,'cashier','admin')",[org]);
    await pg.query("INSERT INTO professionals(id,organization_id,name,is_active) VALUES ($1,$2,'Profissional teste',true),($3,$4,'Outro profissional',true)",[professional,org,foreignProfessional,outside]);
    await pg.query("INSERT INTO services(id,organization_id,name) VALUES ($1,$2,'Procedimento teste')",[service,org]);
    await pg.query("INSERT INTO financial_accounts(id,organization_id,name,is_active) VALUES ($1,$2,'Conta teste',true),($3,$4,'Conta externa',true)",[account,org,foreignAccount,outside]);
    await pg.query("INSERT INTO appointments(id,organization_id,professional_id,service_id,status,price_in_cents,starts_at) VALUES ($1,$2,$3,$4,'completed',10000,'2026-09-05')",[visit,org,professional,service]);
    const rule=randomUUID(),legacy=randomUUID();
    await pg.query("INSERT INTO commission_rules(id,organization_id,professional_id,service_id,calculation_type,value,trigger,is_active) VALUES ($1,$2,$3,$4,'percentage',1000,'completed_appointment',true)",[rule,org,professional,service]);
    await pg.query("INSERT INTO commission_entries(id,organization_id,professional_id,appointment_id,rule_id,base_amount_in_cents,amount_in_cents,status,competence,paid_at) VALUES ($1,$2,$3,$4,$5,10000,1000,'paid','2026-09','2026-09-10')",[legacy,org,professional,visit,rule]);
    await pg.exec(await readFile(new URL("../drizzle/0076_commission_ledger.sql",import.meta.url),"utf8"));
    assert.equal((await pg.query<{source_key:string}>("SELECT source_key FROM commission_entries WHERE id=$1",[legacy])).rows[0].source_key,`appointment:${visit}`);
    const database=drizzle(pg,{schema}) as unknown as typeof db,repo=new CommissionRepository(database);
    const sale=randomUUID(),product=randomUUID(),bill=randomUUID(),item=randomUUID();
    await pg.query("INSERT INTO retail_product_variants(id,organization_id) VALUES ($1,$2)",[product,org]);
    await pg.query("INSERT INTO financial_entries(id,organization_id,type,status,amount_in_cents) VALUES ($1,$2,'receivable','received',9000)",[bill,org]);
    await pg.query("INSERT INTO retail_sales(id,organization_id,commission_user_id,financial_entry_id,status,sold_at,created_by_user_id) VALUES ($1,$2,'seller',$3,'completed','2026-10-01 12:00:00','cashier')",[sale,org,bill]);
    await pg.query("INSERT INTO retail_sale_items(id,organization_id,sale_id,variant_id,product_name,variant_name,quantity,total_in_cents,commission_in_cents) VALUES ($1,$2,$3,$4,'Produto teste','Padrão',1,9000,900)",[item,org,sale,product]);
    await repo.refresh(org,"America/Bahia","cashier","2026-10");await repo.refresh(org,"America/Bahia","cashier","2026-10");
    assert.equal((await pg.query("SELECT id FROM commission_entries WHERE sale_item_id=$1",[item])).rows.length,1);
    const [ledger]=(await pg.query<{id:string;beneficiary_user_id:string;amount_in_cents:number}>("SELECT * FROM commission_entries WHERE sale_item_id=$1",[item])).rows;
    assert.equal(ledger.beneficiary_user_id,"seller");assert.equal(ledger.amount_in_cents,900);
    const paymentInput={org,timezone:"America/Bahia",actor:"cashier",beneficiary:{professionalId:null,beneficiaryUserId:"seller"},requestKey:randomUUID(),paidOn:"2026-10-17",accountId:account,method:"pix",notes:"Quitação sintética",expectedAmount:900};
    await assert.rejects(repo.pay({...paymentInput,accountId:foreignAccount}),/conta ativa/);
    await assert.rejects(repo.pay({...paymentInput,expectedAmount:1000}),/saldo mudou/);
    const payout=await repo.pay(paymentInput);assert.equal(await repo.pay(paymentInput),payout);
    assert.equal((await pg.query("SELECT id FROM commission_payments")).rows.length,1);
    assert.equal((await pg.query("SELECT id FROM financial_entries WHERE source='commission_payment' AND status='paid'")).rows.length,1);
    assert.equal((await pg.query("SELECT id FROM commission_entries WHERE beneficiary_user_id='seller' AND status='pending'")).rows.length,0);
    await repo.reverse(org,"cashier",payout,"Data registrada incorretamente");await repo.reverse(org,"cashier",payout,"Repetição idempotente");
    assert.equal((await pg.query<{status:string}>("SELECT status FROM commission_entries WHERE id=$1",[ledger.id])).rows[0].status,"pending");
    const payout2=await repo.pay({...paymentInput,requestKey:randomUUID()});assert.notEqual(payout2,payout);
    await pg.query("UPDATE retail_sales SET status='refunded' WHERE id=$1",[sale]);
    await repo.refresh(org,"America/Bahia","cashier","2026-10");await repo.refresh(org,"America/Bahia","cashier","2026-10");
    const adjustments=(await pg.query<{amount_in_cents:number}>("SELECT amount_in_cents FROM commission_entries WHERE original_entry_id=$1 AND status='pending'",[ledger.id])).rows;
    assert.deepEqual(adjustments.map(row=>row.amount_in_cents),[-900]);
    assert.equal((await pg.query<{status:string}>("SELECT status FROM commission_entries WHERE id=$1",[ledger.id])).rows[0].status,"paid");
    await assert.rejects(repo.reverse(outside,"cashier",payout2,"Outro estabelecimento"),/não encontrada/);
    await repo.reverse(org,"cashier",payout2,"Revisão após devolução");await repo.refresh(org,"America/Bahia","cashier","2026-10");
    assert.equal((await pg.query("SELECT id FROM commission_entries WHERE beneficiary_user_id='seller' AND status='pending'")).rows.length,0);
    assert.equal((await pg.query("SELECT id FROM commission_payments")).rows.length,2);
    // Completion and receipt are distinct triggers; gross catalog prices do not override net bills.
    const receivedVisit=randomUUID(),receivedBill=randomUUID(),receivedRule=randomUUID();
    await pg.query("INSERT INTO appointments(id,organization_id,professional_id,service_id,status,price_in_cents,starts_at) VALUES ($1,$2,$3,$4,'completed',10000,'2026-10-02')",[receivedVisit,org,professional,service]);
    await pg.query("INSERT INTO commission_rules(id,organization_id,professional_id,service_id,calculation_type,value,trigger,is_active,created_at) VALUES ($1,$2,$3,$4,'percentage',2000,'received',true,now()+interval '1 second')",[receivedRule,org,professional,service]);
    await pg.query("INSERT INTO financial_entries(id,organization_id,appointment_id,type,status,amount_in_cents) VALUES ($1,$2,$3,'receivable','pending',8000)",[receivedBill,org,receivedVisit]);
    await repo.refresh(org,"America/Bahia","cashier","2026-10");
    assert.equal((await pg.query("SELECT id FROM commission_entries WHERE appointment_id=$1",[receivedVisit])).rows.length,0);
    await pg.query("UPDATE financial_entries SET status='received' WHERE id=$1",[receivedBill]);await repo.refresh(org,"America/Bahia","cashier","2026-10");
    assert.equal((await pg.query<{amount_in_cents:number}>("SELECT amount_in_cents FROM commission_entries WHERE appointment_id=$1",[receivedVisit])).rows[0].amount_in_cents,1600);
    // A received sale with the main performed procedure must not create a second commission.
    const mainSale=randomUUID(),mainItem=randomUUID();
    await pg.query("INSERT INTO retail_sales(id,organization_id,commission_user_id,financial_entry_id,attendance_id,status,sold_at) VALUES ($1,$2,'seller',$3,$4,'completed','2026-10-02')",[mainSale,org,receivedBill,receivedVisit]);
    await pg.query("INSERT INTO retail_sale_items(id,organization_id,sale_id,service_id,product_name,variant_name,quantity,total_in_cents,commission_in_cents) VALUES ($1,$2,$3,$4,'Procedimento teste','Procedimento realizado',1,8000,0)",[mainItem,org,mainSale,service]);
    await repo.refresh(org,"America/Bahia","cashier","2026-10");assert.equal((await pg.query("SELECT id FROM commission_entries WHERE sale_item_id=$1",[mainItem])).rows.length,0);
    // A paid refund is offset against future earnings, rather than erasing past payments.
    await pg.query("UPDATE retail_sales SET status='completed' WHERE id=$1",[sale]);await repo.refresh(org,"America/Bahia","cashier","2026-10");
    await repo.pay({...paymentInput,requestKey:randomUUID()});await pg.query("UPDATE retail_sales SET status='refunded' WHERE id=$1",[sale]);await repo.refresh(org,"America/Bahia","cashier","2026-10");
    const newSale=randomUUID(),newItem=randomUUID(),newBill=randomUUID();
    await pg.query("INSERT INTO financial_entries(id,organization_id,type,status,amount_in_cents) VALUES ($1,$2,'receivable','received',12000)",[newBill,org]);
    await pg.query("INSERT INTO retail_sales(id,organization_id,commission_user_id,financial_entry_id,status,sold_at) VALUES ($1,$2,'seller',$3,'completed','2026-10-03')",[newSale,org,newBill]);
    await pg.query("INSERT INTO retail_sale_items(id,organization_id,sale_id,variant_id,product_name,variant_name,quantity,total_in_cents,commission_in_cents) VALUES ($1,$2,$3,$4,'Outro produto','Padrão',1,12000,1200)",[newItem,org,newSale,product]);
    await repo.refresh(org,"America/Bahia","cashier","2026-10");
    const outcomes=await Promise.allSettled([randomUUID(),randomUUID()].map(requestKey=>repo.pay({...paymentInput,requestKey,expectedAmount:300})));
    assert.equal(outcomes.filter(item=>item.status==="fulfilled").length,1);
    assert.equal((await pg.query("SELECT id FROM commission_entries WHERE beneficiary_user_id='seller' AND status='pending'")).rows.length,0);
    assert.equal((await pg.query<{amount_in_cents:number}>("SELECT amount_in_cents FROM commission_payments WHERE amount_in_cents=300")).rows.length,1);
    // Other tenants cannot select the beneficiary, account or reverse an existing payout.
    await assert.rejects(repo.pay({...paymentInput,beneficiary:{professionalId:foreignProfessional,beneficiaryUserId:null},requestKey:randomUUID()}),/Beneficiário não encontrado/);
    const pack=randomUUID(),balance=randomUUID(),packBill=randomUUID(),packVisit=randomUUID(),extraVisit=randomUUID(),usage=randomUUID(),extraUsage=randomUUID();
    await pg.query("INSERT INTO client_packages(id,organization_id,status,price_in_cents) VALUES ($1,$2,'active',10000)",[pack,org]);
    await pg.query("INSERT INTO client_package_balances(id,organization_id,client_package_id,service_id,total_quantity,used_quantity) VALUES ($1,$2,$3,$4,3,3)",[balance,org,pack,service]);
    await pg.query("INSERT INTO financial_entries(id,organization_id,client_package_id,type,status,amount_in_cents) VALUES ($1,$2,$3,'receivable','received',10000)",[packBill,org,pack]);
    await pg.query("INSERT INTO appointments(id,organization_id,professional_id,service_id,status,price_in_cents,starts_at) VALUES ($1,$2,$3,$4,'completed',0,'2026-10-05')",[packVisit,org,professional,service]);
    await pg.query("INSERT INTO appointments(id,organization_id,professional_id,service_id,status,price_in_cents,starts_at,metadata) VALUES ($1,$2,$3,$4,'completed',0,'2026-10-06','{\"primaryProcedureRemoved\":true}')",[extraVisit,org,professional,service]);
    await pg.query("INSERT INTO package_usages(id,organization_id,appointment_id,client_package_id,balance_id,quantity,status,reserved_at) VALUES ($1,$2,$3,$4,$5,1,'consumed','2026-10-01 12:00:00')",[usage,org,packVisit,pack,balance]);
    await pg.query("INSERT INTO attendance_package_items(id,organization_id,appointment_id,client_package_id,balance_id,quantity,status,created_at) VALUES ($1,$2,$3,$4,$5,2,'consumed','2026-10-02')",[extraUsage,org,extraVisit,pack,balance]);
    await repo.refresh(org,"America/Bahia","cashier","2026-10");
    const packageEntries=(await pg.query<{base_amount_in_cents:number;amount_in_cents:number}>("SELECT base_amount_in_cents,amount_in_cents FROM commission_entries WHERE source_key IN ($1,$2)",[`appointment:${packVisit}`,`package-use:${extraUsage}`])).rows;
    assert.equal(packageEntries.reduce((sum,item)=>sum+item.base_amount_in_cents,0),10000);
    assert.equal(packageEntries.reduce((sum,item)=>sum+item.amount_in_cents,0),2000);
  }finally{await pg.close();}
});
