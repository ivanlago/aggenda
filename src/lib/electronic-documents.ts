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
  organizationLegalName?: string | null;
  organizationTaxId?: string | null;
  organizationPhone?: string | null;
  organizationWhatsapp?: string | null;
  organizationEmail?: string | null;
  organizationWebsite?: string | null;
  organizationAddress?: string | null;
  organizationLogoUrl?: string | null;
  organizationBrandColor?: string | null;
  organizationFooter?: string | null;
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
  workflowType?: string | null;
  issuedAt?: Date | null;
  professionalName?: string | null;
  professionalRegistration?: string | null;
}) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 54;
  let page: PDFPage = pdf.addPage(pageSize);
  const parseBrandColor = () => {
    const value = input.organizationBrandColor ?? "#37664f";
    const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
    return match ? rgb(Number.parseInt(match[1], 16) / 255, Number.parseInt(match[2], 16) / 255, Number.parseInt(match[3], 16) / 255) : rgb(0.14, 0.33, 0.23);
  };
  const brand = parseBrandColor();
  let logo: Awaited<ReturnType<PDFDocument["embedPng"]>> | null = null;
  if (input.organizationLogoUrl) {
    try {
      const url = new URL(input.organizationLogoUrl);
      if (url.protocol === "https:" && !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)) {
        const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (response.ok && bytes.length <= 2_000_000) logo = response.headers.get("content-type")?.includes("jpeg") ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
      }
    } catch { /* O cabeçalho textual permanece disponível. */ }
  }
  let y = 748;
  const drawHeader = () => {
    if (logo) {
      const scaled = logo.scaleToFit(72, 52);
      page.drawImage(logo, { x: margin, y: 779 - scaled.height, width: scaled.width, height: scaled.height });
    }
    const headerX = logo ? margin + 88 : margin;
    page.drawText(input.organizationName, { x: headerX, y: 786, size: 14, font: bold, color: brand });
    const legal = [input.organizationLegalName, input.organizationTaxId ? `CNPJ/CPF ${input.organizationTaxId}` : null].filter(Boolean).join(" - ");
    if (legal) page.drawText(legal.slice(0, 90), { x: headerX, y: 770, size: 7.5, font: regular, color: rgb(0.35, 0.39, 0.36) });
    const contact = [input.organizationPhone, input.organizationWhatsapp && input.organizationWhatsapp !== input.organizationPhone ? `WhatsApp ${input.organizationWhatsapp}` : null, input.organizationEmail, input.organizationWebsite].filter(Boolean).join(" - ");
    if (contact) page.drawText(contact.slice(0, 115), { x: headerX, y: 757, size: 7.5, font: regular, color: rgb(0.35, 0.39, 0.36) });
    if (input.organizationAddress) page.drawText(input.organizationAddress.slice(0, 115), { x: headerX, y: 744, size: 7.5, font: regular, color: rgb(0.35, 0.39, 0.36) });
    page.drawLine({ start: { x: margin, y: 730 }, end: { x: pageSize[0] - margin, y: 730 }, thickness: 1.2, color: brand });
  };
  const addPage = () => { page = pdf.addPage(pageSize); drawHeader(); y = 704; };
  const drawLines = (text: string, font: PDFFont, size: number, color = rgb(0.12, 0.16, 0.13)) => {
    for (const line of wrapText(text, font, size, pageSize[0] - margin * 2)) {
      if (y < 92) addPage();
      page.drawText(line, { x: margin, y, size, font, color });
      y -= size * 1.55;
    }
  };

  drawHeader();
  y = 690;
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
  if (input.workflowType === "professional_issue") {
    if (y < 180) addPage();
    y -= 24;
    page.drawLine({ start: { x: margin, y }, end: { x: pageSize[0] - margin, y }, thickness: 0.8, color: rgb(0.75, 0.78, 0.75) });
    y -= 28;
    drawLines(input.professionalName || input.signerName, bold, 11, brand);
    if (input.professionalRegistration) drawLines(input.professionalRegistration, regular, 9);
    if (input.issuedAt) drawLines(`Emitido em ${input.issuedAt.toLocaleString("pt-BR", { timeZone: "America/Bahia" })}`, regular, 9);
    drawLines(`Código de integridade: ${input.evidenceHash || input.contentHash}`, regular, 7.5);
  }
  const pages = pdf.getPages();
  pages.forEach((current, index) => {
    const footer = [input.organizationFooter, `Documento ${index + 1}/${pages.length} - gerado pelo Aggenda`].filter(Boolean).join(" - ");
    current.drawLine({ start: { x: margin, y: 48 }, end: { x: pageSize[0] - margin, y: 48 }, thickness: 0.5, color: rgb(0.8, 0.82, 0.8) });
    current.drawText(footer.slice(0, 135), { x: margin, y: 31, size: 7, font: regular, color: rgb(0.4, 0.44, 0.4) });
  });
  pdf.setTitle(input.title);
  pdf.setAuthor(input.organizationName);
  pdf.setProducer("Aggenda — assinatura eletrônica");
  return pdf.save();
}
