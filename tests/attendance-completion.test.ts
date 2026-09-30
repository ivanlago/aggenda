import assert from "node:assert/strict";
import test from "node:test";
import { attendanceCompletionError } from "../src/lib/attendance-completion";

const unpaid = { pendingItems: 0, primaryRemoved: false, primaryAmount: 10000, primaryPaymentStatus: "pending", unpaidAdditional: false };

test("requires payment for the primary procedure", () => {
  assert.match(attendanceCompletionError(unpaid)!, /procedimento principal/);
  assert.equal(attendanceCompletionError({ ...unpaid, primaryPaymentStatus: "received" }), null);
  assert.match(attendanceCompletionError({ ...unpaid, primaryPaymentStatus: "refunded" })!, /procedimento principal/);
});

test("reserved and consumed package sessions cover the primary procedure", () => {
  for (const primaryPackageStatus of ["reserved", "consumed"]) assert.equal(attendanceCompletionError({ ...unpaid, primaryPackageStatus }), null);
  assert.ok(attendanceCompletionError({ ...unpaid, primaryPackageStatus: "reversed" }));
});

test("paid primary or package does not exempt additional purchases", () => {
  assert.match(attendanceCompletionError({ ...unpaid, primaryPaymentStatus: "received", pendingItems: 1 })!, /pendentes de pagamento/);
  assert.ok(attendanceCompletionError({ ...unpaid, primaryPackageStatus: "reserved", unpaidAdditional: true }));
});

test("removed and free primary procedures need no charge", () => {
  assert.equal(attendanceCompletionError({ ...unpaid, primaryRemoved: true }), null);
  assert.equal(attendanceCompletionError({ ...unpaid, primaryAmount: 0 }), null);
  assert.ok(attendanceCompletionError({ ...unpaid, primaryRemoved: true, pendingItems: 1 }));
});
