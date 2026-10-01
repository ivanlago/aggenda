import { writeFileSync } from "node:fs";
import { createSignedDocumentPdf } from "../../src/lib/electronic-documents";
async function main() {
 const pdf = await createSignedDocumentPdf({organizationName: "Clínica Exemplo", organizationLegalName: "Clínica Exemplo Ltda.", organizationTaxId: "00.000.000/0001-00", organizationAddress: "Av. Exemplo, 123, Sala 405 - Centro - Salvador/BA - CEP 40000-000", organizationPhone: "71999991234", organizationWhatsapp: "71988885678", organizationEmail: "contato@clinicaexemplo.com.br", organizationWebsite: "https://www.clinicaexemplo.com.br", title: "Atestado Médico", content: Array(60).fill("Atesto, para os devidos fins, que o paciente foi atendido nesta clínica na data indicada.").join("\n"), signerName: "Dra. Exemplo", signerEmail: "profissional@example.com", workflowType: "professional_issue", professionalName: "Dra. Exemplo", professionalRegistration: "CRM 12345/BA", contentHash: "abc123"});
 writeFileSync("tmp/pdfs/rodape.pdf",pdf);
}
main();
