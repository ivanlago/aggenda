import assert from "node:assert/strict";
import test from "node:test";
import { splitPosPackagePrice } from "../src/lib/pos-pricing";

test("distribui desconto de múltiplos pacotes sem perder centavos", () => {
  assert.deepEqual(splitPosPackagePrice(10000, 3), [3334, 3333, 3333]);
  for (let quantity = 1; quantity <= 100; quantity++) {
    assert.equal(splitPosPackagePrice(15999, quantity).reduce((sum, price) => sum + price, 0), 15999);
  }
});
test("rejeita total negativo e quantidade inválida", () => {
  for (const [total, quantity] of [[-1, 1], [1, 0], [1, 101], [1.1, 1], [1, 1.5]]) assert.throws(() => splitPosPackagePrice(total, quantity));
});
