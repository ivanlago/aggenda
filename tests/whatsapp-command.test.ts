import assert from "node:assert/strict";
import test from "node:test";

import { isAffirmativeWhatsAppCommand, isNegativeWhatsAppCommand, normalizeWhatsAppCommand } from "../src/lib/whatsapp-command";

test("normaliza acentos, caixa e espaços", () => {
  assert.equal(normalizeWhatsAppCommand("  não confirmar  "), "NAO CONFIRMAR");
});

test("aceita confirmações explícitas", () => {
  for (const value of ["sim", "Confirmar", "confirmo", "pode confirmar"]) {
    assert.equal(isAffirmativeWhatsAppCommand(value), true);
  }
  assert.equal(isAffirmativeWhatsAppCommand("talvez"), false);
});

test("aceita desistência explícita e não confunde texto livre", () => {
  for (const value of ["não", "cancelar", "desistir", "não confirmar"]) {
    assert.equal(isNegativeWhatsAppCommand(value), true);
  }
  assert.equal(isNegativeWhatsAppCommand("quero cancelar meu agendamento"), false);
});
