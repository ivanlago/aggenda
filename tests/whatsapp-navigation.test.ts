import assert from "node:assert/strict";
import test from "node:test";
import { navigateWhatsApp, parseNavigationState, type NavigationContext } from "../src/lib/whatsapp-navigation";
import { incomingWhatsAppText, whatsappMessageContent, usesInternalWhatsAppAgent } from "../src/lib/whatsapp-message";
import { buildWhatsAppCatalogPdf } from "../src/lib/whatsapp-catalog-pdf";
import { PDFDocument } from "pdf-lib";

const context: NavigationContext = {
  name: "Empresa de teste", core: true, bookingUrl: "https://aggenda.example/cliente/teste", address: "Rua de teste, 10", phone: "71999999999", email: null,
  categories: [{ id: "category-a", name: "Consultas" }, { id: "category-b", name: "Exames" }],
  services: Array.from({ length: 16 }, (_, index) => ({ id: `service-${index}`, name: `Avaliação ${index}`, shortName: null, categoryId: index < 10 ? "category-a" : null, description: "Avaliação inicial.", preparation: "Levar documentos.", durationMinutes: 30, priceInCents: 12000 })),
  products: [{ id: "product-a", label: "Produto de teste · 50 ml", priceInCents: 5900 }],
};

test("shared menus adapt to mode and catalog; categories and services paginate within WhatsApp limits", () => {
  const home = navigateWhatsApp(context, "Olá!")!;
  assert.match(home.reply, /Como podemos ajudar/);
  assert.ok(home.navigationState!.options.some(option => option.title === "Meus agendamentos"));
  assert.ok(home.navigationState!.options.some(option => option.title === "Produtos"));
  const empty = navigateWhatsApp({ ...context, products: [], services: [] }, "menu")!;
  assert.ok(!empty.navigationState!.options.some(option => /Produtos|Agendar/.test(option.title)));
  const categories = navigateWhatsApp(context, "1", home.navigationState)!;
  assert.match(categories.reply, /Selecione a categoria/);
  assert.ok(!categories.reply.includes("Exames"), "empty categories stay hidden");
  const first = navigateWhatsApp(context, "1", categories.navigationState)!;
  assert.match(first.reply, /Avaliação 0/);
  assert.equal(first.navigationState!.options.length, 9);
  const next = first.navigationState!.options.find(option => option.title === "Próxima página")!;
  const second = navigateWhatsApp(context, next.id, first.navigationState)!;
  assert.match(second.reply, /Avaliação 9/);
  assert.ok(second.navigationState!.options.length <= 10);
  const content = whatsappMessageContent({ text: first.reply, options: first.navigationState!.options });
  assert.equal(content.type, "interactive");
  assert.ok(content.interactive!.action.sections[0].rows.every(row => row.title.length <= 24));
  assert.equal(incomingWhatsAppText({ interactive: { list_reply: { id: next.id } } }), next.id);
  assert.equal(usesInternalWhatsAppAgent("CHAT_AI"), true);
  assert.equal(usesInternalWhatsAppAgent("CORE_AI"), true);
  assert.equal(usesInternalWhatsAppAgent("CHAT"), false);
});

test("service information offers controlled booking in Core and a preselected secure portal link in Chat", () => {
  const state = { options: [{ id: "nav:service:service-0", title: "Avaliação 0" }] };
  const core = navigateWhatsApp(context, "1", state)!;
  assert.match(core.reply, /Preparação: Levar documentos/);
  assert.match(core.reply, /120,00/);
  const go = navigateWhatsApp(context, "1", core.navigationState)!;
  assert.equal(go.continueText, "Quero agendar Avaliação 0");
  const chat = navigateWhatsApp({ ...context, core: false }, "1", state)!;
  assert.match(chat.reply, /servico=service-0/);
  assert.match(chat.reply, /só estará concluído após a confirmação na página/);
  assert.equal(chat.continueText, undefined);
  assert.match(navigateWhatsApp({ ...context, core: false }, "Quero cancelar meu agendamento")!.reply, /área do cliente/);
  assert.match(navigateWhatsApp({ ...context, core: false, bookingUrl: null }, "quero agendar Avaliação 0")!.reply, /não está habilitado/);
  assert.equal(navigateWhatsApp(context, "31/12/2026"), null, "booking dates pass through to the existing agent");
  assert.equal(navigateWhatsApp(context, "2"), null, "appointment choices do not become navigation without a menu state");
  assert.match(navigateWhatsApp(context, "nav:service:another-tenant", state)!.reply, /Como podemos ajudar/, "unoffered IDs cannot select another service");
  assert.equal(parseNavigationState(null), undefined);
});

test("handoff never promises immediate service and product documents contain only the sales catalog", async () => {
  assert.equal(navigateWhatsApp(context, "Não sei qual escolher")!.handoff, true);
  assert.match(navigateWhatsApp(context, "equipe")!.reply, /horário de atendimento/);
  const result = navigateWhatsApp(context, "Produtos")!;
  assert.equal(result.document, true);
  const content = whatsappMessageContent({ text: result.reply, document: { link: "https://example.test/catalog.pdf" } });
  assert.equal(content.type, "document");
  const bytes = await buildWhatsAppCatalogPdf({ name: "Clínica de teste", updatedAt: "21/10/2026", products: Array.from({ length: 40 }, () => ({ label: "Produto de exemplo com descrição longa ".repeat(5), priceInCents: 5900 })) });
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() > 1, "long catalogs continue on additional pages");
});
