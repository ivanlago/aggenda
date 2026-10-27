import assert from "node:assert/strict";
import test from "node:test";
import { signatureAddonQuote } from "../src/lib/subscription-addon";
const plan = { product: "essential" as const, cycle: "monthly" as const, professionals: 1, signatures: false, nfse: "none" as const };
test("monthly additional service charges remaining days and prorates the first allowance", () => {
  const q = signatureAddonQuote(plan, "base", new Date("2026-10-01T00:00:00Z"), new Date("2026-11-01T00:00:00Z"), new Date("2026-10-16T12:00:00Z"));
  assert.equal(q.amountInCents, 995); assert.equal(q.initialDocumentLimit, 25); assert.equal(q.monthlyPriceInCents, 1990); assert.equal(q.renewalAmountInCents, 6980);
});
test("annual additional service preserves calendar anchors, remaining months and cycle discount", () => {
  const q = signatureAddonQuote({ ...plan, cycle: "annual" }, "base", new Date("2026-01-31T00:00:00Z"), new Date("2027-01-31T00:00:00Z"), new Date("2026-07-31T00:00:00Z"));
  assert.equal(q.monthlyPriceInCents,1592); assert.equal(q.amountInCents,1592*6); assert.equal(q.initialDocumentLimit,50); assert.equal(q.contractEndsAt,"2027-01-31T00:00:00.000Z");
  assert.throws(() => signatureAddonQuote(plan,"base",new Date("2026-01-01"),new Date("2026-02-01"),new Date("2026-02-01")));
  assert.throws(() => signatureAddonQuote({...plan,signatures:true},"base",new Date("2026-01-01"),new Date("2027-01-01"),new Date("2026-02-01")));
});
