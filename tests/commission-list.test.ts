import assert from "node:assert/strict";
import test from "node:test";
import {commissionListFilters} from "../src/lib/commission-list";

test("commission period defaults to complete current month and supports arbitrary valid ranges",()=>{
  assert.deepEqual([commissionListFilters({},"2026-11-13").start,commissionListFilters({},"2026-11-13").end],["2026-11-01","2026-11-30"]);
  assert.equal(commissionListFilters({},"2028-02-01").end,"2028-02-29");
  assert.equal(commissionListFilters({inicio:"2026-10-15",fim:"2026-11-05"},"2026-11-13").error,"");
  for(const query of [{inicio:"2026-02-30"},{inicio:"2026-11-30",fim:"2026-11-01"}]) assert.ok(commissionListFilters(query,"2026-11-13").error);
});
test("unchecked deductions survive GET submission and all statuses are supported",()=>{
  assert.equal(commissionListFilters({},"2026-11-13").deductDiscount,true);
  const filters=commissionListFilters({consulta:"1",custo:"1",taxa:"1",status:"paid",beneficiario:"user:a"},"2026-11-13");
  assert.equal(filters.deductDiscount,false);assert.equal(filters.deductCost,true);assert.equal(filters.deductFees,true);assert.equal(filters.beneficiary,"user:a");
  for(const status of ["pending","paid","cancelled"]) assert.equal(commissionListFilters({status},"2026-11-13").status,status);
  assert.equal(commissionListFilters({status:"invalid"},"2026-11-13").status,"");
});
