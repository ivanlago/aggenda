import assert from "node:assert/strict";
import test from "node:test";
import { legalDefinitions, legalFieldValues, legalPresetContent, renderLegalDocument, legalContextValues, reusableLegalFields } from "../src/lib/legal-documents";
const contract = legalDefinitions.find(item => item.key === "contract")!;
const fields = { scope: "Limpeza e materiais incluídos", sessions: "3", unitPrice: "19.99", payment: "À vista", startDate: "2026-09-30", endDate: "2026-10-30", cancellation: "Reagendamento por acordo" };
test("orçamento calcula total em centavos e formata datas", () => {
 const values = legalFieldValues(contract, fields);
 assert.match(values.total, /59,97/);
 assert.equal(values.startDate, "30/09/2026");
});
test("bloqueia campos clínicos pendentes e datas inexistentes", () => {
 assert.throws(() => legalFieldValues(contract, { ...fields, scope: "[PREENCHER]" }));
 assert.throws(() => legalFieldValues(contract, { ...fields, startDate: "2026-02-30" }));
 assert.throws(() => legalFieldValues(contract, { ...fields, endDate: "2026-01-01" }));
});
test("bloqueia valores monetários e quantidades inválidos", () => {
 for (const unitPrice of ["-1", "NaN", "Infinity", "1.999", "10000001"]) assert.throws(() => legalFieldValues(contract, { ...fields, unitPrice }));
 for (const sessions of ["0", "1.5", "1001"]) assert.throws(() => legalFieldValues(contract, { ...fields, sessions }));
});
test("todos os modelos podem ser montados sem variáveis pendentes", () => {
 for (const definition of legalDefinitions) {
 const input = Object.fromEntries(definition.fields.map(field => [field.id, field.type === "date" ? "2026-09-30" : field.type === "money" ? "100.00" : field.type === "number" ? "1" : "Informação confirmada"]));
 const content = renderLegalDocument(legalPresetContent(definition), { ...legalFieldValues(definition, input), cliente: "Paciente de teste", clinica: "Clínica de teste" });
 assert.doesNotMatch(content, /\{\{|\[PREENCHER/);
 }
});
test("texto informado não pode introduzir variáveis de cadastro", () => {
 assert.throws(() => legalFieldValues(contract, { ...fields, scope: "{{cliente}}" }));
});
test("a identificação do documento é montada com dados cadastrais", () => {
 const values = legalContextValues({ name: "Clínica", legalName: "Razão social", taxId: "123", publicAddress: "Rua A", phone: "999", publicEmail: null }, { id: "1", name: "Paciente", cpf: "456", address: "Rua B", email: null, phone: null }, { id: "2", name: "Profissional", registration: "CRM 123/BA" }, { id: "3", name: "Procedimento", description: null, preparation: null, durationMinutes: 30, priceInCents: 10000 }, "30/09/2026");
 assert.equal(values.clinica, "Razão social"); assert.equal(values.registro, "CRM 123/BA"); assert.equal(values.cpf, "456"); assert.equal(values.duracao, "30 minutos");
});

test("padrões reutilizáveis excluem identidade, datas e valores específicos", () => {
 const defaults = reusableLegalFields(contract, { ...fields, clientId: "paciente", cpf: "123", guardianName: "Pessoa", reference: "Contrato individual" });
 assert.equal(defaults.scope, fields.scope);
 for (const key of ["clientId", "cpf", "guardianName", "reference", "startDate", "endDate", "unitPrice", "sessions"]) assert.equal(key in defaults, false);
 const guardian = legalDefinitions.find(item => item.key === "guardian")!;
 assert.equal("guardianDocument" in reusableLegalFields(guardian, { guardianDocument: "123", guardianName: "Pessoa" }), false);
});
