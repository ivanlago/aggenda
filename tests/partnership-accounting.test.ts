import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { partnershipDre, type DreEntry, type DreAllocation } from "../src/lib/partnership-accounting";
import { describeNfsePartnership, preparePartnership, assertNfsePartnership } from "../src/lib/nfse/partnership";

const entry: DreEntry={id:"r",type:"receivable",status:"received",amountInCents:10000,dueDate:"2026-10-01",realizedDate:"2026-11-01"};
const allocation: DreAllocation={id:"a",financialEntryId:"r",receivedOn:"2026-11-01",grossInCents:10000,partnerInCents:4000,salonInCents:6000,withheldInCents:500,voidedAt:null};

test("DRE excludes gross partner share including withholding, and does not expense linked transfers twice",()=>{
 const payment={...entry,id:"p",type:"payable",status:"paid",amountInCents:3500};
 const tax={...payment,id:"tax",amountInCents:500};
 const rent={...payment,id:"rent",amountInCents:1000};
 const result=partnershipDre([entry,payment,tax,rent],[allocation],[{financialEntryId:"p",amountInCents:3500},{financialEntryId:"tax",amountInCents:500}]);
 assert.equal(result.grossRevenue,10000);assert.equal(result.partnerShares,4000);assert.equal(result.revenue,6000);assert.equal(result.expenses,1000);assert.equal(result.partnerOutflows,4000);assert.deepEqual(result.issues,[]);
});
test("DRE rejects changed dates, excessive allocations, changed outflow amounts and ignores voids/cancelled receipts",()=>{
 for(const part of [{...allocation,receivedOn:"2026-10-01"},{...allocation,grossInCents:20000,salonInCents:16000}]){const result=partnershipDre([entry],[part],[]);assert.equal(result.partnerShares,0);assert.deepEqual(result.issues,["r"]);}
 assert.equal(partnershipDre([entry],[{...allocation,voidedAt:new Date()}],[]).partnerShares,0);
 assert.equal(partnershipDre([{...entry,status:"cancelled"}],[allocation],[]).revenue,0);
 const changed=partnershipDre([{...entry,id:"p",type:"payable",status:"paid",amountInCents:800}],[allocation],[{financialEntryId:"p",amountInCents:500}]);assert.equal(changed.expenses,800);assert.deepEqual(changed.issues,["p"]);
});
test("DRE allocates multiple partners without rounding the partner portion a second time",()=>{
 const result=partnershipDre([entry],[{...allocation,grossInCents:5000,partnerInCents:2000,salonInCents:3000},{...allocation,id:"b",grossInCents:5000,partnerInCents:1500,salonInCents:3500}],[]);assert.equal(result.revenue,6500);assert.equal(result.partnerShares,3500);
});
test("NFS-e disclosure is deterministic, includes CNPJ and both shares, and detects changes",()=>{
 const a={id:randomUUID(),cnpj:"12345678000195",service:"Estética & cuidado",gross:10000,partner:4000,salon:6000};
 const prepared=preparePartnership([a],10000)!;
 const description=describeNfsePartnership("Serviço prestado",prepared,2000);assert.match(description,/12345678000195/);assert.match(description,/40,00/);assert.match(description,/60,00/);
 assert.equal(prepared.taxTreatment,"gross_value_sandbox_review");assertNfsePartnership(prepared,preparePartnership([a],10000));
 assert.throws(()=>assertNfsePartnership(preparePartnership([{...a,partner:4500,salon:5500}],10000),prepared),/mudou/);
 assert.throws(()=>assertNfsePartnership(undefined,prepared),/mudou/);
 assert.throws(()=>preparePartnership([{...a,gross:20000,salon:16000}],10000),/não correspondem/);
 assert.throws(()=>describeNfsePartnership("x".repeat(1990),prepared,2000),/Reduza/);
});
