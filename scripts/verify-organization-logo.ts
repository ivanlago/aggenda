import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { uploadCatalogImage, deleteCatalogImage } from "../src/lib/cloudinary";
import { createSignedDocumentPdf, sha256 } from "../src/lib/electronic-documents";
import { managedOrganizationLogoId } from "../src/lib/organization-logo";

loadEnvConfig(process.cwd());

async function main() {
  const organizationId = `verification-${randomUUID()}`;
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVxkAAAAASUVORK5CYII=", "base64");
  const image = await uploadCatalogImage(new File([bytes], "logo-test.png", { type: "image/png" }), organizationId, "logos");
  try {
    assert.equal(managedOrganizationLogoId(image.url, organizationId, process.env.CLOUDINARY_CLOUD_NAME), image.publicId);
    const response = await fetch(image.url);
    assert.ok(response.ok);
    const uploadedBytes = Buffer.from(await response.arrayBuffer());
    assert.equal(uploadedBytes.subarray(1, 4).toString(), "PNG");
    const content = "Documento de teste da logo, sem dados reais.";
    const pdfBytes = await createSignedDocumentPdf({ organizationName: "Empresa de teste", organizationLogoUrl: image.url, title: "Teste de logo", content, contentHash: sha256(content), signerName: "Teste", signerEmail: "teste@example.com" });
    const pdf = await PDFDocument.load(pdfBytes);
    const images = pdf.context.enumerateIndirectObjects().filter(([, object]) => object instanceof PDFRawStream && object.dict.get(PDFName.of("Subtype"))?.toString() === "/Image");
    assert.ok(images.length > 0, "A logo deve estar embutida no PDF.");
    console.log("Upload PNG, isolamento da empresa e logo embutida no PDF verificados.");
  } finally {
    await deleteCatalogImage(image.publicId);
    console.log("Imagem temporária de teste removida; nenhum cadastro alterado.");
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Falha ao verificar logo."); process.exitCode = 1; });
