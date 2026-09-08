import assert from "node:assert/strict";
import test from "node:test";
import { attendancePaymentState } from "../src/lib/attendance-payment";

test("não oferece nova cobrança para procedimento recebido ou coberto por pacote", () => {
  assert.equal(attendancePaymentState({ paymentStatus: "received", appointmentStatus: "completed" }), "paid");
  for (const packageStatus of ["reserved", "consumed"]) assert.equal(attendancePaymentState({ packageStatus, appointmentStatus: "confirmed" }), "package");
});
test("pacote revertido não quita um atendimento reagendado", () => {
  assert.equal(attendancePaymentState({ packageStatus: "reversed", paymentStatus: "pending", appointmentStatus: "scheduled" }), "pending");
});
test("atendimento concluído não significa pagamento recebido", () => {
  assert.equal(attendancePaymentState({ paymentStatus: "pending", appointmentStatus: "completed" }), "pending");
});
test("cancelamento e não comparecimento exigem revisão antes de receber", () => {
  for (const appointmentStatus of ["cancelled", "no_show"]) assert.equal(attendancePaymentState({ appointmentStatus }), "blocked");
});
