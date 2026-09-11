import assert from "node:assert/strict";
import test from "node:test";
import { allocateOrderDiscount } from "../src/lib/order-discount";
import { quoteTotals, matchesQuoteItems, type QuoteLine } from "../src/lib/retail-quote-items";

test("rateia reais e percentuais sobre o saldo dos itens sem perder centavos", () => {
  assert.deepEqual(allocateOrderDiscount([1000, 2000], "amount", "3,00"), [100, 200]);
  assert.deepEqual(allocateOrderDiscount([1000, 2000], "percent", "10"), [100, 200]);
  assert.deepEqual(allocateOrderDiscount([1, 1, 1], "amount", "0,02"), [1, 1, 0]);
  assert.deepEqual(allocateOrderDiscount([999, 0, 201], "percent", "100"), [999, 0, 201]);
  assert.deepEqual(allocateOrderDiscount([], "amount", ""), []);
  assert.deepEqual(allocateOrderDiscount([10000], "percent", "12,35"), [1235]);
});

test("rejeita descontos negativos, excessivos ou inválidos", () => {
  for (const raw of ["-1", "abc", "Infinity", "1.001", "1,2,3"]) assert.throws(() => allocateOrderDiscount([1000], "amount", raw));
  assert.throws(() => allocateOrderDiscount([1000], "amount", "10,01"));
  assert.throws(() => allocateOrderDiscount([1000], "percent", "100,01"));
  assert.throws(() => allocateOrderDiscount([-1], "percent", "10"));
});

test("desconto geral compõe descontos existentes e preserva totais do orçamento convertido", () => {
  const items: QuoteLine[] = [
    { variantId: "a", kind: "product", label: "Produto", quantity: 2, unitPriceInCents: 1000, discountInCents: 100 },
    { variantId: "b", kind: "service", label: "Serviço", quantity: 1, unitPriceInCents: 2000, discountInCents: 0 },
  ];
  const shares = allocateOrderDiscount(items.map((item) => item.quantity * item.unitPriceInCents - item.discountInCents), "percent", "10");
  const saved = items.map((item, index) => ({ ...item, discountInCents: item.discountInCents + shares[index] }));
  assert.deepEqual(quoteTotals(saved), { subtotalInCents: 4000, discountInCents: 490, totalInCents: 3510 });
  assert.equal(matchesQuoteItems(JSON.parse(JSON.stringify(saved)), saved), true);
});
