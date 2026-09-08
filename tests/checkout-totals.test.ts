import assert from "node:assert/strict";
import test from "node:test";
import { splitCheckoutTotal } from "../src/lib/checkout-totals";

test("procedimento sem adicionais gera somente sua receita", () => {
  assert.deepEqual(splitCheckoutTotal(20000, 20000), { procedureInCents: 20000, additionalInCents: 0 });
});
test("carrinho misto mantém a soma financeira igual ao recibo", () => {
  const split = splitCheckoutTotal(45099, 20000);
  assert.equal(split.additionalInCents, 25099);
  assert.equal(split.procedureInCents + split.additionalInCents, 45099);
});
test("venda sem procedimento e totais inválidos", () => {
  assert.deepEqual(splitCheckoutTotal(5099, 0), { procedureInCents: 0, additionalInCents: 5099 });
  for (const [total, procedure] of [[100, 101], [-1, 0], [10, -1], [10.5, 1]]) assert.throws(() => splitCheckoutTotal(total, procedure));
});
