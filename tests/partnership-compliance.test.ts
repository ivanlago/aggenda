import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "../src/db/schema";
import { partnershipContractSchema, partnershipPending } from "../src/lib/partnership-compliance";
import type * as Actions from "../src/actions/partnership-allocations";
import type * as PartnershipActions from "../src/actions/professional-fiscal-partnership";

const complete = partnershipContractSchema.parse({reference:"Contrato fictício",startsOn:"2026-01-01",homologatedOn:"2026-01-01",authority:"Sindicato fictício",protocol:"TESTE",documentUrl:"https://example.invalid/contrato",paymentTerms:"Mensal",taxTerms:"Conforme contador",eligible:true,witnesses:true,clausesConfirmed:true,fiscalRegularity:true,responsibilityAccepted:true});

test("partnership requires documentary declarations, valid dates and effective contract",()=>{
  assert.deepEqual(partnershipPending(complete,"2026-11-13"),[]);
  assert.ok(partnershipPending({...complete,endsOn:"2026-10-31"},"2026-11-13").includes("Contrato vencido"));
  assert.ok(partnershipPending({...complete,terminatedOn:"2026-11-13"},"2026-11-13").includes("Parceria encerrada"));
  assert.ok(partnershipPending({...complete,homologatedOn:"2026-12-01"},"2026-11-13").includes("Homologação posterior ao recebimento"));
  assert.ok(partnershipPending(partnershipContractSchema.parse({}),"2026-11-13").length>8);
  for(const startsOn of ["2026-02-30","2026-99-01","not-a-date"]) assert.equal(partnershipContractSchema.safeParse({startsOn}).success,false);
  assert.equal(partnershipContractSchema.safeParse({documentUrl:"javascript:alert(1)"}).success,false);
  assert.equal(partnershipContractSchema.safeParse({startsOn:"2026-12-01",endsOn:"2026-01-01"}).success,false);
});

test("migration and real actions preserve fiscal history, scope tenants and prevent duplicate/excess allocation",async()=>{
  const pg = new PGlite();
  const key=`partnerTest${randomUUID().replaceAll("-","")}`;
  const org=randomUUID(),otherOrg=randomUUID(),professionalId=randomUUID(),otherPartner=randomUUID(),foreign=randomUUID(),entry=randomUUID(),foreignEntry=randomUUID(),service=randomUUID(),otherService=randomUUID();
  const state={database:drizzle(pg),org,role:"owner"};Object.assign(globalThis,{[key]:state});
  try {
    const tables={organizations:schema.organizations,users:schema.users,professionals:schema.professionals,services:schema.services,financial_entries:schema.financialEntries,audit_logs:schema.auditLogs,professional_fiscal_partnerships:schema.professionalFiscalPartnerships,professional_fiscal_shares:schema.professionalFiscalShares};
    for(const [name,table] of Object.entries(tables)){
      const columns=Object.values(getTableColumns(table)).filter(column=>name!=="professional_fiscal_partnerships"||column.name!=="contract").map(column=>{
        const type=column.enumValues?"text":column.getSQLType();
        const fallback=column.primary&&type==="uuid"?" DEFAULT gen_random_uuid()":["created_at","updated_at"].includes(column.name)?" DEFAULT now()":typeof column.default==="string"?` DEFAULT '${column.default.replaceAll("'","''")}'`:typeof column.default==="boolean"||typeof column.default==="number"?` DEFAULT ${column.default}`:"";
        return `"${column.name}" ${type}${column.primary?" PRIMARY KEY":""}${fallback}`;
      });
      await pg.exec(`CREATE TABLE "${name}" (${columns.join(",")})`);
    }
    await pg.exec("CREATE UNIQUE INDEX fiscal_rate_unique ON professional_fiscal_shares(professional_id,service_id)");
    await pg.query("INSERT INTO professional_fiscal_partnerships(professional_id,organization_id,cnpj,is_active) VALUES($1,$2,'12345678000195',true)",[professionalId,org]);
    await pg.exec(readFileSync("drizzle/0109_partner_contracts_and_allocations.sql","utf8"));
    await pg.exec(readFileSync("drizzle/0110_partner_outflows.sql","utf8"));
    assert.deepEqual((await pg.query("SELECT contract FROM professional_fiscal_partnerships")).rows,[{contract:{}}],"legacy partnership remains an incomplete declaration");
    for(const id of [org,otherOrg]) await pg.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Fictício',$2)",[id,`test-${id}`]);
    await pg.exec("INSERT INTO users(id,name,email) VALUES('owner','Fictício','owner@example.invalid')");
    for(const [id,tenant] of [[professionalId,org],[otherPartner,org],[foreign,otherOrg]]){
      await pg.query("INSERT INTO professionals(id,organization_id,name) VALUES($1,$2,'Profissional fictício')",[id,tenant]);
      await pg.query("INSERT INTO professional_fiscal_partnerships(professional_id,organization_id,cnpj,is_active,contract) VALUES($1,$2,'12345678000195',true,$3) ON CONFLICT(professional_id) DO UPDATE SET contract=EXCLUDED.contract",[id,tenant,JSON.stringify(complete)]);
    }
    for(const id of [service,otherService]){
      await pg.query("INSERT INTO services(id,organization_id,name,duration_minutes) VALUES($1,$2,'Serviço fictício',30)",[id,org]);
      for(const professional of [professionalId,otherPartner]) await pg.query("INSERT INTO professional_fiscal_shares(professional_id,service_id,percentage_basis_points) VALUES($1,$2,4000)",[professional,id]);
    }
    for(const [id,tenant] of [[entry,org],[foreignEntry,otherOrg]]) await pg.query("INSERT INTO financial_entries(id,organization_id,type,status,amount_in_cents,realized_date,due_date,description) VALUES($1,$2,'receivable','received',10000,'2026-11-13','2026-11-13','Recebimento fictício')",[id,tenant]);
    const bundle=await build({stdin:{contents:'export * from "./src/actions/partnership-allocations";export * from "./src/actions/professional-fiscal-partnership";',resolveDir:process.cwd(),loader:"ts"},bundle:true,write:false,format:"cjs",platform:"node",packages:"external",plugins:[{name:key,setup(builder){
      const mocks:Record<string,string>={"@/db":`export const db=globalThis.${key}.database`,"@/lib/session":`export async function requireOrganization(){return {organization:{id:globalThis.${key}.org,role:globalThis.${key}.role},session:{user:{id:'owner'}}}}`,"next/cache":"export function revalidatePath(){}"};
      builder.onResolve({filter:/./},args=>mocks[args.path]?{path:args.path,namespace:key}:undefined);builder.onLoad({filter:/./,namespace:key},args=>({contents:mocks[args.path],loader:"js"}));
    }}]});
    const actionModule={exports:{} as typeof Actions & typeof PartnershipActions};
    new Function("require","module","exports",bundle.outputFiles[0].text)(createRequire(import.meta.url),actionModule,actionModule.exports);
    const form=(values:Record<string,string>)=>{const f=new FormData();for(const [k,v] of Object.entries(values))f.set(k,v);return f;};
    const data=(values:Record<string,string>={})=>form({professionalId,financialEntryId:entry,serviceId:service,gross:"60,00",withheld:"2,00",withholdingDescription:"Retenção fictícia",confirmed:"on",...values});
    await actionModule.exports.recordPartnershipAllocation(data());
    const [row]=(await pg.query<{id:string;partner_in_cents:number;salon_in_cents:number;withheld_in_cents:number;snapshot:{contract:{reference:string}}}>("SELECT * FROM professional_fiscal_allocations")).rows;
    assert.equal(row.partner_in_cents,2400);assert.equal(row.salon_in_cents,3600);assert.equal(row.withheld_in_cents,200);
    await assert.rejects(actionModule.exports.recordPartnershipAllocation(data()),/já foi apurado/);
    await assert.rejects(actionModule.exports.recordPartnershipAllocation(data({professionalId:otherPartner,gross:"50"})),/ultrapassam/);
    await assert.rejects(actionModule.exports.recordPartnershipAllocation(data({financialEntryId:foreignEntry})),/recebimento confirmado/);
    await assert.rejects(actionModule.exports.recordPartnershipAllocation(data({professionalId:foreign})),/parceria não está ativa/);
    await pg.query("UPDATE professional_fiscal_partnerships SET contract=$1 WHERE professional_id=$2",[JSON.stringify({...complete,reference:"Contrato alterado"}),professionalId]);
    assert.equal(row.snapshot.contract.reference,"Contrato fictício");
    await pg.query("UPDATE professional_fiscal_partnerships SET contract=$1 WHERE professional_id=$2",[JSON.stringify({...complete,endsOn:"2026-02-01"}),otherPartner]);
    await assert.rejects(actionModule.exports.recordPartnershipAllocation(data({professionalId:otherPartner,gross:"20"})),/Contrato vencido/);
    await actionModule.exports.updatePartnershipDocuments(form({id:row.id,consumerInvoice:"NFS-e consumidor fictícia",partnerInvoice:"NFS-e parceiro fictícia"}));
    state.org=otherOrg;await assert.rejects(actionModule.exports.updatePartnershipDocuments(form({id:row.id})),/não encontrada/);state.org=org;
    state.role="receptionist";await assert.rejects(actionModule.exports.recordPartnershipAllocation(data()));state.role="owner";
    await actionModule.exports.voidPartnershipAllocation(form({id:row.id,reason:"Correção da atribuição do recebimento"}));
    await actionModule.exports.recordPartnershipAllocation(data({gross:"100"}));
    assert.equal((await pg.query("SELECT * FROM professional_fiscal_allocations WHERE voided_at IS NULL")).rows.length,1);
    assert.equal((await pg.query("SELECT * FROM professional_fiscal_allocations WHERE voided_at IS NOT NULL")).rows.length,1);
    assert.equal((await pg.query("SELECT * FROM financial_entries")).rows.length,2,"allocation does not duplicate income or create expenses");
    assert.ok((await pg.query("SELECT * FROM audit_logs")).rows.length>=4);
    const current=(await pg.query<{id:string}>("SELECT id FROM professional_fiscal_allocations WHERE voided_at IS NULL")).rows[0];
    const payment=randomUUID(),tax=randomUUID();
    for(const [id,amount] of [[payment,3800],[tax,200]]) await pg.query("INSERT INTO financial_entries(id,organization_id,type,status,source,amount_in_cents,realized_date,due_date,description) VALUES($1,$2,'payable','paid','manual',$3,'2026-11-13','2026-11-13','Repasse fictício')",[id,org,amount]);
    await assert.rejects(actionModule.exports.linkPartnershipOutflow(form({allocationId:current.id,financialEntryId:tax,kind:"net_transfer"})),/exatamente igual/);
    await actionModule.exports.linkPartnershipOutflow(form({allocationId:current.id,financialEntryId:payment,kind:"net_transfer"}));
    await actionModule.exports.linkPartnershipOutflow(form({allocationId:current.id,financialEntryId:tax,kind:"tax_remittance"}));
    await assert.rejects(actionModule.exports.voidPartnershipAllocation(form({id:current.id,reason:"Tentativa com repasse vinculado"})),/Desvincule/);
    const links=(await pg.query<{id:string}>("SELECT id FROM professional_fiscal_outflows")).rows;
    state.org=otherOrg;await assert.rejects(actionModule.exports.unlinkPartnershipOutflow(form({id:links[0].id,reason:"Tentativa em outra empresa"})),/não encontrado/);state.org=org;
    for(const link of links) await actionModule.exports.unlinkPartnershipOutflow(form({id:link.id,reason:"Correção do vínculo do pagamento"}));
    assert.equal((await pg.query("SELECT * FROM financial_entries WHERE type='payable'")).rows.length,2,"unlinking never deletes the original payments");
    const bad=await actionModule.exports.saveFiscalPartnership(form({professionalId,active:"on",cnpj:"12345678000195",contractSubmitted:"1",startsOn:"2026-99-01"}));assert.ok(bad?.error);
  } finally {Reflect.deleteProperty(globalThis,key);await pg.close();}
});
