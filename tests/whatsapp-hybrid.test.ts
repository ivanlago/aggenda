import assert from "node:assert/strict";
import test from "node:test";
import { hybridAnswerSchema, hybridRelativeDate, hybridTimeChoice, requestsHuman, usesHybridSecretary } from "../src/lib/whatsapp-hybrid";

test("pilot is opt-in for an exact organization/contact and never changes Atendimento", () => {
  const previous = process.env.AGGENDA_SECRETARY_HYBRID_CONTACTS;
  try {
    delete process.env.AGGENDA_SECRETARY_HYBRID_CONTACTS;
    assert.equal(usesHybridSecretary("org", "5571991814240", "core_ai"), false);
    process.env.AGGENDA_SECRETARY_HYBRID_CONTACTS = "org:71 99181-4240";
    assert.equal(usesHybridSecretary("org", "5571991814240", "core_ai"), true);
    assert.equal(usesHybridSecretary("another", "5571991814240", "core_ai"), false);
    assert.equal(usesHybridSecretary("org", "5571999999999", "core_ai"), false);
    assert.equal(usesHybridSecretary("org", "5571991814240", "chat_ai"), false);
    process.env.AGGENDA_SECRETARY_HYBRID_CONTACTS = "*:*,org:";
    assert.equal(usesHybridSecretary("org", "5571991814240", "core_ai"), false);
  } finally {
    if (previous === undefined) delete process.env.AGGENDA_SECRETARY_HYBRID_CONTACTS;
    else process.env.AGGENDA_SECRETARY_HYBRID_CONTACTS = previous;
  }
});

test("hybrid interpretation cannot silently turn omitted confidence into a human handoff", () => {
  const incomplete = { action: "reply", reply: "Você deseja avaliação inicial ou estética?" };
  const validation = hybridAnswerSchema.safeParse(incomplete);
  assert.equal(validation.success, false);
  if (!validation.success) assert.ok(validation.error.issues.some(issue => issue.path[0] === "confidence"));
  assert.equal(hybridAnswerSchema.safeParse({ ...incomplete, intent: "clarify_service", confidence: 0.85, goal: "book", serviceId: null, professionalId: null, appointmentId: null, date: null, time: null, cancellationReason: null, period: null }).success, true);
});

test("offered-hour choices accept natural numeric phrases without absorbing new requests", () => {
  for (const text of ["quero as 11 horas", "Quero às 11 horas!", "11h", "11:00", "pode ser às 11", "prefiro 11h por favor"])
    assert.equal(hybridTimeChoice(text), "11:00", text);
  assert.equal(hybridTimeChoice("quero às 11:30"), "11:30");
  for (const text of ["quero para as catorze horas", "prefiro às quatorze horas", "às duas da tarde"])
    assert.equal(hybridTimeChoice(text), "14:00", text);
  assert.equal(hybridTimeChoice("quero às duas e meia da tarde"), "14:30");
  assert.equal(hybridTimeChoice("às vinte e três horas"), "23:00");
  assert.equal(hybridTimeChoice("quero catorze horas amanhã"), null);
  assert.equal(hybridTimeChoice("às catorze da manhã"), null);
  for (const text of ["quero às 11 amanhã", "quero cancelar às 11", "24:00", "quero às 11:99", "quanto custa?", "às 11 com outra pessoa"])
    assert.equal(hybridTimeChoice(text), null, text);
});

test("relative dates use the company's local day, including weekdays across a month boundary", () => {
  assert.equal(hybridRelativeDate("queria para sexta-feira pela manhã", "2026-11-11"), "2026-11-13");
  assert.equal(hybridRelativeDate("amanhã à tarde", "2026-11-11"), "2026-11-12");
  assert.equal(hybridRelativeDate("depois de amanhã", "2026-11-30"), "2026-12-02");
  assert.equal(hybridRelativeDate("hoje", "2026-11-11"), "2026-11-11");
  assert.equal(hybridRelativeDate("próxima sexta", "2026-11-13"), "2026-11-20");
  assert.equal(hybridRelativeDate("qualquer horário", "2026-11-11"), null);
});

test("common human requests do not require an AI call; questions and negations do not transfer", () => {
  for (const text of ["Quero falar com uma pessoa", "Gostaria de conversar com um atendente, por favor!", "Preciso falar com a equipe", "falar com uma pessoa de verdade"])
    assert.equal(requestsHuman(text), true, text);
  for (const text of ["Não quero falar com uma pessoa", "A Camila é uma pessoa?", "Quero agendar com Maria", "Quanto custa?"])
    assert.equal(requestsHuman(text), false, text);
});
