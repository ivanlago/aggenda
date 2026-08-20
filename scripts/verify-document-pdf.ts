import { mkdir, writeFile } from "node:fs/promises";

import { createSignedDocumentPdf, sha256 } from "../src/lib/electronic-documents";

async function main() {
const content = "Paciente: Maria da Silva\n\nUSO ORAL\n\n1. Medicamento de exemplo - apresentação\nPosologia: conforme orientação profissional\nQuantidade: 1 caixa\n\nOrientações: documento visual de homologação, sem validade clínica.";
const pdf = await createSignedDocumentPdf({
  organizationName: "Clínica Exemplo Aggenda",
  organizationLegalName: "Clínica Exemplo Serviços de Saúde Ltda.",
  organizationTaxId: "12.345.678/0001-90",
  organizationPhone: "(71) 3333-0000",
  organizationWhatsapp: "(71) 99999-0000",
  organizationEmail: "contato@clinicaexemplo.com.br",
  organizationWebsite: "https://clinicaexemplo.com.br",
  organizationAddress: "Av. Exemplo, 100, Salvador - BA",
  organizationBrandColor: "#37664f",
  organizationFooter: "Atendimento com hora marcada",
  title: "Receituário",
  content,
  signerName: "Dra. Ana Profissional",
  signerEmail: "ana@clinicaexemplo.com.br",
  contentHash: sha256(content),
  evidenceHash: sha256(`sample-${content}`),
  workflowType: "professional_issue",
  issuedAt: new Date("2026-08-20T12:00:00-03:00"),
  professionalName: "Dra. Ana Profissional",
  professionalRegistration: "CRM 12345 BA",
});
await mkdir("tmp/pdfs/verification", { recursive: true });
await writeFile("tmp/pdfs/verification/papel-timbrado.pdf", pdf);
}

void main();
