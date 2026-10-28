import assert from "node:assert/strict";
import test from "node:test";
import { financePeriod, isManagedCharge } from "../src/lib/finance-view";

const entry = (overrides = {}) => ({ id: "entry", type: "receivable", status: "pending", dueDate: "2026-10-10", realizedDate: null as string | null, accountId: "bank", categoryId: "services", amountInCents: 10000, ...overrides });
const today = "2026-10-28";
const period = (entries: ReturnType<typeof entry>[], filters = {}) => financePeriod(entries, filters, today, "2026-10-01", "2026-11-01");

test("monthly summary uses settlement for realized amounts and due dates for pending amounts", () => {
  const result = period([
    entry({ id: "old-settled-now", dueDate: "2026-09-01", realizedDate: "2026-10-02", status: "received" }),
    entry({ id: "due-now-settled-later", realizedDate: "2026-11-01", status: "received", amountInCents: 30000 }),
    entry({ id: "pending-now", amountInCents: 20000 }),
    entry({ id: "old-pending", dueDate: "2026-09-01" }),
    entry({ id: "cancelled", status: "cancelled" }),
    entry({ id: "outgoing", type: "payable", status: "paid", realizedDate: "2026-10-15", amountInCents: 1500 }),
  ]);
  assert.equal(result.received, 10000);
  assert.equal(result.paid, 1500);
  assert.equal(result.receivable, 20000);
  assert.deepEqual(result.overdue.map((item) => item.id), ["pending-now"]);
  assert.equal(result.entries.length, 5);
});

test("account, category, type and status affect both rows and summary", () => {
  const entries = [entry(), entry({ id: "other", accountId: "cash", amountInCents: 5000 }), entry({ id: "paid", status: "received", realizedDate: today }), entry({ id: "expense", type: "payable", categoryId: "rent" })];
  const result = period(entries, { conta: "bank", categoria: "services", tipo: "receivable", status: "overdue" });
  assert.deepEqual(result.entries.map((item) => item.id), ["entry"]);
  assert.equal(result.receivable, 10000);
  assert.equal(result.received, 0);
  assert.equal(result.payable, 0);
  assert.equal(result.overdue.length, 1);
});

test("month boundaries exclude next month and overdue excludes today's due date", () => {
  const result = period([entry({ id: "today", dueDate: today }), entry({ id: "next", dueDate: "2026-11-01" })]);
  assert.equal(result.entries.length, 1);
  assert.equal(result.receivable, 10000);
  assert.equal(result.overdue.length, 0);
});

test("online charges in review, overdue, confirmed or partially refunded cannot be managed manually", () => {
  for (const status of ["pending", "overdue", "paid", "payment_review", "partially_refunded"]) assert.equal(isManagedCharge(status), true);
  for (const status of ["cancelled", "refunded"]) assert.equal(isManagedCharge(status), false);
});

test("dashboard today shortcut scopes both rows and totals without including yesterday or settled entries", () => {
  const result = period([
    entry({ id: "today", dueDate: today }),
    entry({ id: "yesterday", dueDate: "2026-10-27", amountInCents: 90000 }),
    entry({ id: "received", dueDate: today, realizedDate: today, status: "received" }),
    entry({ id: "expense", dueDate: today, type: "payable" }),
  ], { dia: today, tipo: "receivable", status: "pending" });
  assert.deepEqual(result.entries.map(item => item.id), ["today"]);
  assert.equal(result.receivable, 10000);
  assert.equal(result.received, 0);
  assert.equal(result.payable, 0);
});
