import assert from "node:assert/strict";
import test from "node:test";
import { serviceDepositDisplay, serviceDepositSettings } from "../src/lib/service-deposit";

function parse(type: string, value: string) {
  const form = new FormData();
  form.set("depositType", type);
  form.set("depositValue", value);
  return serviceDepositSettings(form);
}

test("sinal em reais é salvo em centavos e exibido em reais", () => {
  assert.equal(parse("fixed", "50,00").depositValue, 5000);
  assert.equal(parse("fixed", "12.50").depositValue, 1250);
  assert.equal(parse("fixed", "1.250,99").depositValue, 125099);
  assert.equal(serviceDepositDisplay("fixed", 5000), "50,00");
  assert.equal(parse("fixed", serviceDepositDisplay("fixed", 125099)).depositValue, 125099);
});
test("percentual mantém sua unidade e valida limites", () => {
  assert.equal(parse("percentage", "20").depositValue, 20);
  assert.equal(serviceDepositDisplay("percentage", 20), "20");
  for (const value of ["101", "20,5", "-1", "abc", ""]) assert.throws(() => parse("percentage", value));
});
test("tipos sem valor ignoram valores antigos e dinheiro inválido é rejeitado", () => {
  assert.equal(parse("none", "5000").depositValue, 0);
  assert.equal(parse("full", "5000").depositValue, 0);
  for (const value of ["-50", "abc", "1.234", "999999999999"]) assert.throws(() => parse("fixed", value));
});
