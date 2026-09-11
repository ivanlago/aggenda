import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { quoteItemsSchema, quoteTotals, matchesQuoteItems, type QuoteLine } from "../src/lib/retail-quote-items";
import { buildRetailQuotePdf } from "../src/lib/retail-quote-pdf";

const productId = "10000000-0000-4000-8000-000000000001";
const serviceId = "service:10000000-0000-4000-8000-000000000002";
const lines: QuoteLine[] = [
  { variantId: productId, label: "Produto", kind: "product", quantity: 3, unitPriceInCents: 999, discountInCents: 100 },
  { variantId: serviceId, label: "Procedimento", kind: "service", quantity: 2, unitPriceInCents: 12345, discountInCents: 1 },
];

test("orçamento calcula produtos e procedimentos em centavos", () => {
  assert.deepEqual(quoteTotals(lines), { subtotalInCents: 27687, discountInCents: 101, totalInCents: 27586 });
  assert.throws(() => quoteTotals([{ ...lines[0], discountInCents: 3000 }]));
  assert.throws(() => quoteTotals([{ ...lines[0], kind: "package", quantity: 101 }]));
});
test("rejeita itens duplicados, quantidades inválidas e cobranças do atendimento", () => {
  const input = { variantId: productId, quantity: 1, discountInCents: 0 };
  assert.equal(quoteItemsSchema.safeParse([input]).success, true);
  for (const items of [[], [input, input], [{ ...input, quantity: 0 }], [{ ...input, quantity: 1.5 }], [{ ...input, variantId: `appointment:${productId}` }]]) assert.equal(quoteItemsSchema.safeParse(items).success, false);
});
test("conversão exige os mesmos itens, quantidades e descontos do orçamento", () => {
  assert.equal(matchesQuoteItems([...lines].reverse(), lines), true);
  assert.equal(matchesQuoteItems([{ ...lines[0], quantity: 4 }, lines[1]], lines), false);
  assert.equal(matchesQuoteItems([{ ...lines[0], discountInCents: 0 }, lines[1]], lines), false);
  assert.equal(matchesQuoteItems(lines.slice(1), lines), false);
});
test("PDF identificado e anônimo suporta acentos, nomes longos e várias páginas", async () => {
  for (const clientName of [null, "João da Conceição"]) {
    const bytes = await buildRetailQuotePdf({ id: productId, organizationName: "Clínica de teste", clientName, createdDate: "11/09/2026", validUntil: "2026-10-11", items: Array.from({ length: 50 }, (_, index) => ({ ...lines[0], label: `${index + 1}. Procedimento de avaliação ${"com descrição extensa ".repeat(8)} ${"A".repeat(120)} 🧪` })), ...quoteTotals(Array.from({ length: 50 }, () => lines[0])), notes: "Condições de pagamento: orçamento sujeito à aprovação.\n".repeat(30) });
    const pdf = await PDFDocument.load(bytes);
    assert.ok(pdf.getPageCount() > 1);
    assert.equal(pdf.getTitle(), "Orçamento #10000000");
  }
});
