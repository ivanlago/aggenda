import assert from "node:assert/strict";
import test from "node:test";
import { requestsHuman, usesHybridSecretary } from "../src/lib/whatsapp-hybrid";

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

test("common human requests do not require an AI call; questions and negations do not transfer", () => {
  for (const text of ["Quero falar com uma pessoa", "Gostaria de conversar com um atendente, por favor!", "Preciso falar com a equipe", "falar com uma pessoa de verdade"])
    assert.equal(requestsHuman(text), true, text);
  for (const text of ["Não quero falar com uma pessoa", "A Camila é uma pessoa?", "Quero agendar com Maria", "Quanto custa?"])
    assert.equal(requestsHuman(text), false, text);
});
