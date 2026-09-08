import assert from "node:assert/strict";
import test from "node:test";
import { calculateAttendanceQuote } from "../src/lib/attendance-quote";

test("calcula orçamento em centavos e ignora totais enviados pelo cliente", () => {
  const result = calculateAttendanceQuote([{ description: " Sessão ", quantity: 3, unitPrice: 19990, total: 1 }, { description: "Produto", quantity: 2, unitPrice: 105 }]);
  assert.equal(result.total, 60180);
  assert.equal(result.items[0].description, "Sessão");
});

test("rejeita valores negativos, fracionários, excessivos e itens vazios", () => {
  for (const input of [[], null, [{ description: " ", quantity: 1, unitPrice: 1 }], [{ description: "Sessão", quantity: 0, unitPrice: 1 }], [{ description: "Sessão", quantity: 1.5, unitPrice: 1 }], [{ description: "Sessão", quantity: 1, unitPrice: -1 }], [{ description: "Sessão", quantity: 1, unitPrice: 0.5 }], [{ description: "Sessão", quantity: 1001, unitPrice: 1 }]]) {
    assert.throws(() => calculateAttendanceQuote(input));
  }
});
