import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

export function createDocumentCredentials() {
  const token = randomBytes(32).toString("base64url");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return { token, tokenHash: sha256(token), code, codeHash: sha256(code) };
}

export function matchesHash(value: string, expectedHash: string) {
  const received = Buffer.from(sha256(value));
  const expected = Buffer.from(expectedHash);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function renderDocumentTemplate(content: string, values: Record<string, string>) {
  return content.replace(/{{\s*([\w_]+)\s*}}/g, (_match, key: string) => values[key] ?? "");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    if (!paragraph.trim()) { lines.push(""); continue; }
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
      else { if (current) lines.push(current); current = word; }
    }
    if (current) lines.push(current);
  }
  return lines;
}

export async function createSignedDocumentPdf(input: {
  organizationName: string;
  title: string;
  content: string;
  signerName: string;
  signerEmail: string;
  signatureData?: string | null;
  signerResponses?: string | null;
  signedAt?: Date | null;
  signerIpAddress?: string | null;
  signerUserAgent?: string | null;
  contentHash: string;
  evidenceHash?: string | null;
}) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 54;
  let page: PDFPage = pdf.addPage(pageSize);
  let y = 787;
  const addPage = () => { page = pdf.addPage(pageSize); y = 787; };
  const drawLines = (text: string, font: PDFFont, size: number, color = rgb(0.12, 0.16, 0.13)) => {
    for (const line of wrapText(text, font, size, pageSize[0] - margin * 2)) {
      if (y < 70) addPage();
      page.drawText(line, { x: margin, y, size, font, color });
      y -= size * 1.55;
    }
  };

  drawLines(input.organizationName, bold, 12, rgb(0.14, 0.33, 0.23));
  y -= 12;
  drawLines(input.title, bold, 20);
  y -= 20;
  drawLines(input.content, regular, 10.5);

  if (input.signerResponses) {
    y -= 20;
    drawLines("RESPOSTAS DO SIGNATÁRIO", bold, 11, rgb(0.14, 0.33, 0.23));
    drawLines(input.signerResponses, regular, 10.5);
  }

  if (input.signedAt) {
    if (y < 260) addPage();
    y -= 24;
    page.drawLine({ start: { x: margin, y }, end: { x: pageSize[0] - margin, y }, thickness: 0.8, color: rgb(0.75, 0.78, 0.75) });
    y -= 28;
    drawLines("REGISTRO DE ASSINATURA ELETRÔNICA", bold, 11, rgb(0.14, 0.33, 0.23));
    if (input.signatureData?.startsWith("data:image/png;base64,")) {
      try {
        const signature = await pdf.embedPng(Buffer.from(input.signatureData.split(",")[1], "base64"));
        const scaled = signature.scaleToFit(210, 72);
        page.drawImage(signature, { x: margin, y: y - scaled.height, width: scaled.width, height: scaled.height });
        y -= scaled.height + 12;
      } catch { /* A evidência textual e criptográfica permanece válida. */ }
    }
    drawLines(`Signatário: ${input.signerName} (${input.signerEmail})`, regular, 9);
    drawLines(`Assinado em: ${input.signedAt.toLocaleString("pt-BR", { timeZone: "America/Bahia" })}`, regular, 9);
    drawLines(`Endereço IP: ${input.signerIpAddress || "não disponível"}`, regular, 9);
    drawLines(`Navegador: ${input.signerUserAgent || "não disponível"}`, regular, 8);
    drawLines(`Hash SHA-256 do conteúdo: ${input.contentHash}`, regular, 7.5);
    drawLines(`Hash SHA-256 das evidências: ${input.evidenceHash || "não disponível"}`, regular, 7.5);
  }
  pdf.setTitle(input.title);
  pdf.setAuthor(input.organizationName);
  pdf.setProducer("Aggenda — assinatura eletrônica");
  return pdf.save();
}
