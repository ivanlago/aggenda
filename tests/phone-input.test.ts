import assert from "node:assert/strict";
import test from "node:test";
import { formatBrazilianPhoneInput, formatPhone } from "../src/lib/phone";

test("typing a mobile number preserves every digit, including the last", () => {
  let value = "";
  let typed = "";
  for (const digit of "71991814240") {
    typed += digit;
    value = formatBrazilianPhoneInput(value + digit);
    assert.equal(value.replace(/\D/g, ""), typed);
  }
  assert.equal(value, "(71) 99181-4240");
  assert.equal(formatPhone(value), value);
});
test("pasting, deleting and replacing a phone does not insert a ninth digit", () => {
  assert.equal(formatBrazilianPhoneInput("(71) 99181-4240"), "(71) 99181-4240");
  assert.equal(formatBrazilianPhoneInput("+55 (71) 99181-4240"), "(71) 99181-4240");
  const shortened = formatBrazilianPhoneInput("(71) 99181-424");
  assert.equal(shortened.replace(/\D/g, ""), "7199181424");
  assert.equal(formatBrazilianPhoneInput(shortened + "0"), "(71) 99181-4240");
  assert.equal(formatBrazilianPhoneInput("7132345678"), "(71) 3234-5678");
  assert.equal(formatBrazilianPhoneInput(""), "");
});
