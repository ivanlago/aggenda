import assert from "node:assert/strict";
import test from "node:test";
import { voucherBookingUrl, voucherCode, voucherError, voucherMessage, voucherPrice, voucherValue, type VoucherRule } from "../src/lib/voucher-rules";

const now = new Date("2026-10-02T12:00:00Z");
const voucher: VoucherRule = { code: "VOLTE10", discountType: "percentage", discountValue: 10, maxUses: 1, usedCount: 0, isActive: true, validFrom: new Date("2026-10-01"), validUntil: new Date("2026-10-03"), clientId: null };
test("accepts public codes and restricts exclusive vouchers to the authenticated client", () => {
  assert.equal(voucherError(voucher, "maria", now), null);
  assert.equal(voucherError({ ...voucher, clientId: "maria" }, "maria", now), null);
  assert.ok(voucherError({ ...voucher, clientId: "maria" }, "joao", now));
});
test("rejects expired, future, inactive and exhausted vouchers", () => {
  for (const rule of [undefined, { ...voucher, isActive: false }, { ...voucher, usedCount: 1 }, { ...voucher, validUntil: new Date("2026-10-01") }, { ...voucher, validFrom: new Date("2026-10-04") }]) assert.ok(voucherError(rule, "maria", now));
});
test("calculates percentages in cents and caps fixed discounts at the procedure price", () => {
  assert.deepEqual(voucherPrice(19999, voucher), { originalPriceInCents: 19999, discountInCents: 2000, finalPriceInCents: 17999 });
  assert.equal(voucherPrice(5000, { discountType: "fixed", discountValue: 10000 }).finalPriceInCents, 0);
  assert.equal(voucherPrice(null, voucher).finalPriceInCents, 0);
  assert.equal(voucherPrice(5000).discountInCents, 0);
});
test("accepts reais using comma or decimal point without multiplying the benefit by 100", () => {
  assert.equal(voucherValue("10,50", "fixed"), 1050);
  assert.equal(voucherValue("10.50", "fixed"), 1050);
  assert.equal(voucherValue("1.000,50", "fixed"), 100050);
  for (const raw of ["0", "-1", "abc", "NaN", "10,001"]) assert.throws(() => voucherValue(raw, "fixed"));
  for (const raw of ["101", "1.5", "Infinity"]) assert.throws(() => voucherValue(raw, "percentage"));
});
test("links preserve the code and open booking, using only verified custom domains", () => {
  const organization = { slug: "clinica-aura", customDomain: "agenda.aura.example", customDomainVerifiedAt: null };
  const url = new URL(voucherBookingUrl(organization, "VOLTE10", "https://www.aggenda.app.br"));
  assert.equal(url.hostname, "www.aggenda.app.br"); assert.equal(url.searchParams.get("voucher"), "VOLTE10"); assert.equal(url.searchParams.get("novo"), "1");
  assert.equal(new URL(voucherBookingUrl({ ...organization, customDomainVerifiedAt: now }, "VOLTE10", "https://www.aggenda.app.br")).hostname, "agenda.aura.example");
});
test("personalizes the message with benefit, deadline and exclusive recipient", () => {
  const message = voucherMessage({ clientName: "Maria", organizationName: "Aura", benefit: "10% de desconto", code: "VOLTE10", validity: "Válido até 30/11/2026", url: "https://example.com", exclusive: true });
  for (const part of ["Maria", "Aura", "VOLTE10", "10%", "30/11/2026", "exclusivo"]) assert.ok(message.includes(part));
  assert.equal(voucherCode(" volte10 "), "VOLTE10");
});
