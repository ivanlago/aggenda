import assert from "node:assert/strict";
import test from "node:test";
import { attendanceCheckoutSummary, attendancePaymentState, shouldPrefillAttendanceCart } from "../src/lib/attendance-payment";

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

 test("PDV desconta o sinal sem oferecer nova cobrança para saldo quitado, pacote ou cobrança gerenciada", () => {
  const base = {appointmentStatus:"confirmed",serviceAmount:500,depositAmount:100,depositStatus:"paid",managedCharge:false};
  assert.deepEqual(attendanceCheckoutSummary(base),{state:"pending",balance:400,awaitingDeposit:false,canReceiveService:true});
  assert.equal(attendanceCheckoutSummary({...base,entryAmount:400}).balance,400);
  for(const depositStatus of ["pending","direct_pending","direct_review"]) assert.equal(attendanceCheckoutSummary({...base,depositStatus}).canReceiveService,false);
  assert.equal(attendanceCheckoutSummary({...base,managedCharge:true}).canReceiveService,false);
  assert.equal(attendanceCheckoutSummary({...base,paymentStatus:"received"}).balance,0);
  assert.equal(attendanceCheckoutSummary({...base,depositAmount:500}).state,"paid");
  assert.equal(attendanceCheckoutSummary({...base,depositAmount:500}).canReceiveService,false);
  for(const packageStatus of ["reserved","consumed"]) assert.equal(attendanceCheckoutSummary({...base,packageStatus}).balance,0);
  assert.equal(attendanceCheckoutSummary({...base,packageStatus:"reversed"}).canReceiveService,true);
  assert.equal(attendanceCheckoutSummary({...base,appointmentStatus:"cancelled"}).canReceiveService,false);
 });
