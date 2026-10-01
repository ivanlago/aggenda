import assert from "node:assert/strict";
import test from "node:test";
import { parseReturnOverrides, procedureReturnState, reminderDate, returnDate, serviceReturnSettings, validReturnDate } from "../src/lib/procedure-return-rules";

test("prazo em dias atravessa meses e anos", () => {
  assert.equal(returnDate("2026-12-20", 30, "days"), "2027-01-19");
});
test("prazo em meses respeita o último dia de fevereiro", () => {
  assert.equal(returnDate("2026-01-31", 1, "months"), "2026-02-28");
  assert.equal(returnDate("2028-01-31", 1, "months"), "2028-02-29");
});
test("sem padrão não gera convite; ajuste permite data individual", () => {
  assert.equal(returnDate("2026-10-01", null, "days"), null);
  assert.equal(returnDate("2026-10-01", null, "days", { mode: "custom", date: "2026-11-05" }), "2026-11-05");
});
test("desativação individual prevalece sobre padrão", () => {
  assert.equal(returnDate("2026-10-01", 30, "days", { mode: "disabled" }), null);
});
test("retorno rejeita datas impossíveis ou anteriores à realização", () => {
  assert.equal(validReturnDate("2026-02-30"), false);
  assert.throws(() => returnDate("2026-10-01", 30, "days", { mode: "custom", date: "2026-09-01" }));
  assert.throws(() => returnDate("2026-10-01", 0, "days"));
});
test("antecedência determina quando o retorno fica próximo", () => {
  assert.equal(reminderDate("2026-10-03", 7), "2026-09-26");
});
test("agendamento suspende convite; cancelamento devolve o retorno à situação calculada", () => {
  assert.equal(procedureReturnState("2026-09-01", 7, "pending", "2026-10-01", true), "scheduled");
  assert.equal(procedureReturnState("2026-09-01", 7, "pending", "2026-10-01", false), "overdue");
  assert.equal(procedureReturnState("2026-10-08", 7, "pending", "2026-10-01", false), "upcoming");
  assert.equal(procedureReturnState("2026-12-01", 7, "pending", "2026-10-01", false), "future");
  assert.equal(procedureReturnState("2026-09-01", 7, "dismissed", "2026-10-01", false), "dismissed");
});
test("cadastro sem prazo e valores inválidos", () => {
  const data = new FormData();
  assert.deepEqual(serviceReturnSettings(data), { returnInterval: null, returnIntervalUnit: "days", returnReminderDays: 7 });
  data.set("returnInterval", "1.5"); assert.throws(() => serviceReturnSettings(data));
  data.set("returnInterval", "30"); data.set("returnReminderDays", "-1"); assert.throws(() => serviceReturnSettings(data));
});
test("ajustes são vinculados por procedimento e validados", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const data = new FormData(); data.set(`returnMode:${id}`, "custom"); data.set(`returnDate:${id}`, "2026-11-01");
  assert.deepEqual(parseReturnOverrides(data)[id], { mode: "custom", date: "2026-11-01" });
  data.set(`returnMode:${id}`, "tampered"); assert.throws(() => parseReturnOverrides(data));
});
