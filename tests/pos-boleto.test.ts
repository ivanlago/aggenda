import assert from "node:assert/strict";
import test from "node:test";
import { boletoSchedule, boletoAvailableFrom } from "../src/lib/pos-boleto";

test("boletos mensais preservam centavos, vencimentos no fim do mês e limite de emissão", () => {
  assert.deepEqual(boletoSchedule(10000,3,"2028-01-31","2028-01-01"),[
    {amountInCents:3334,dueDate:"2028-01-31",installmentNumber:1,installmentCount:3},
    {amountInCents:3333,dueDate:"2028-02-29",installmentNumber:2,installmentCount:3},
    {amountInCents:3333,dueDate:"2028-03-31",installmentNumber:3,installmentCount:3},
  ]);
  assert.equal(boletoAvailableFrom("2028-03-31"),"2028-03-02");
  for (const [count,date] of [[0,"2028-01-31"],[61,"2028-01-31"],[3,"2028-02-30"],[3,"2027-12-31"]] as const) assert.throws(()=>boletoSchedule(10000,count,date,"2028-01-01"));
  assert.throws(()=>boletoSchedule(2,3,"2028-01-31","2028-01-01"));
});
