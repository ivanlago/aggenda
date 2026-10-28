import assert from "node:assert/strict";
import test from "node:test";
import { auditPresentation } from "../src/lib/audit-presentation";
import { paymentMethodLabel } from "../src/lib/presentation-labels";
import { formatOrganizationDateTime, organizationDate, organizationDayRange } from "../src/lib/organization-time";

test("sale history and daily boundaries agree around local midnight", () => {
  const beforeMidnight = new Date("2026-10-27T02:50:18Z");
  assert.equal(organizationDate(beforeMidnight, "America/Bahia"), "2026-10-26");
  assert.match(formatOrganizationDateTime(beforeMidnight, "America/Bahia"), /26\/10\/2026.*23:50/);
  const range = organizationDayRange(beforeMidnight, "America/Bahia");
  assert.equal(range.start.toISOString(), "2026-10-26T03:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-10-27T03:00:00.000Z");
  assert.ok(beforeMidnight >= range.start && beforeMidnight < range.end);
});

test("audit uses readable events and only builds scoped internal destinations for valid record types", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(auditPresentation("pos_payment:completed", "retail_sale", id), {
    label: "Pagamento da venda confirmado", object: "Venda", href: `/vendas/pagamento/${id}`,
  });
  assert.equal(auditPresentation("update", "client", "javascript:bad").href, null);
  assert.equal(auditPresentation("future_action", "unknown_table", id).href, null);
  assert.equal(auditPresentation("create", "appointment", id).href, `/atendimento/${id}`);
});

test("known payment methods render in Portuguese with a readable fallback", () => {
  assert.equal(paymentMethodLabel("credit_card"), "Cartão de crédito");
  assert.equal(paymentMethodLabel("debit_card"), "Cartão de débito");
  assert.equal(paymentMethodLabel("mercado_pago"), "Mercado Pago");
  assert.equal(paymentMethodLabel("unknown"), "Outra forma de pagamento");
});
