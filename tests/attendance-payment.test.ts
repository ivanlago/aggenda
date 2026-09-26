import assert from "node:assert/strict";
import test from "node:test";
import { attendancePaymentState, shouldPrefillAttendanceCart } from "../src/lib/attendance-payment";

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

test("não inclui automaticamente procedimento com saldo válido, mesmo antes de vincular pacote", () => {
  const balance = { serviceId: "service-a", remaining: 2, expired: false };
  assert.equal(shouldPrefillAttendanceCart("pending", "service-a", [balance]), false);
  assert.equal(shouldPrefillAttendanceCart("package", "service-a", []), false);
  assert.equal(shouldPrefillAttendanceCart("paid", "service-a", []), false);
  assert.equal(shouldPrefillAttendanceCart("blocked", "service-a", []), false);
  assert.equal(shouldPrefillAttendanceCart("pending", "service-b", [balance]), true);
  assert.equal(shouldPrefillAttendanceCart("pending", "service-a", [{ ...balance, expired: true }]), true);
  assert.equal(shouldPrefillAttendanceCart("pending", "service-a", [{ ...balance, remaining: 0 }]), true);
});
