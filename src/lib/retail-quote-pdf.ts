import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { QuoteLine } from "@/lib/retail-quote-items";

export type QuotePdfData = {
  id: string; organizationName: string; clientName: string | null; createdDate: string; validUntil: string;
  items: QuoteLine[]; subtotalInCents: number; discountInCents: number; totalInCents: number; notes: string | null;
};
const money = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function safeText(value: string, font: PDFFont) {
  return [...value.replace(/\t/g, " ")].map((char) => { try { font.encodeText(char); return char; } catch { return "?"; } }).join("");
}

export async function buildRetailQuotePdf(data: QuotePdfData) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const brand = rgb(0.07, 0.38, 0.3);
  const ink = rgb(0.12, 0.17, 0.2);
  const muted = rgb(0.4, 0.45, 0.48);
  let page = pdf.addPage([595.28, 841.89]);
  let y = 790;
  function text(value: string, x: number, baseline: number, size = 10, font = regular, color = ink) {
    page.drawText(safeText(value, font), { x, y: baseline, size, font, color });
  }
  function wrap(value: string, width: number, size = 10, font = regular) {
    const lines: string[] = [];
    for (const paragraph of value.split("\n")) {
      let line = "";
      for (const word of safeText(paragraph, font).split(/\s+/)) {
        if (line && font.widthOfTextAtSize(`${line} ${word}`, size) > width) { lines.push(line); line = ""; }
        for (const char of (line ? " " : "") + word) {
          if (font.widthOfTextAtSize(line + char, size) > width) { lines.push(line); line = ""; }
          line += char;
        }
      }
      lines.push(line);
    }
    return lines;
  }
  function ensure(height: number) {
    if (y - height >= 62) return;
    page = pdf.addPage([595.28, 841.89]);
    y = 786;
    text(`ORÇAMENTO #${data.id.slice(0, 8)} - continuação`, 40, y, 11, bold, brand);
    y -= 32;
  }
  function paragraph(value: string, size = 10, font = regular) {
    for (const line of wrap(value, 515, size, font)) { ensure(size + 7); text(line, 40, y, size, font); y -= size + 7; }
  }
  paragraph(data.organizationName, 16, bold);
  y -= 12;
  text("ORÇAMENTO", 40, y, 24, bold, brand); y -= 27;
  paragraph(`#${data.id.slice(0, 8)} · Emissão: ${data.createdDate}`);
  paragraph(`Validade: ${data.validUntil.split("-").reverse().join("/")}`);
  y -= 12;
  paragraph(`Cliente: ${data.clientName || "Não identificado"}`, 11, bold);
  y -= 18;
  for (const [index, item] of data.items.entries()) {
    ensure(66);
    paragraph(`${index + 1}. ${item.label}`, 11, bold);
    ensure(40);
    text(`${item.quantity} × ${money(item.unitPriceInCents)}${item.discountInCents ? ` · Desconto: ${money(item.discountInCents)}` : ""}`, 40, y, 10, regular, muted);
    const amount = money(item.quantity * item.unitPriceInCents - item.discountInCents);
    text(amount, 555 - bold.widthOfTextAtSize(amount, 11), y, 11, bold);
    y -= 19;
    page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.5, color: rgb(0.84, 0.88, 0.87) });
    y -= 22;
  }
  ensure(105);
  paragraph(`Subtotal: ${money(data.subtotalInCents)}`);
  paragraph(`Desconto: ${money(data.discountInCents)}`);
  paragraph(`TOTAL: ${money(data.totalInCents)}`, 17, bold);
  y -= 16;
  if (data.notes) { ensure(44); paragraph("Condições e observações", 11, bold); paragraph(data.notes); y -= 12; }
  paragraph("Orçamento sujeito à aprovação e à disponibilidade dos itens. Não comprova pagamento.", 9);
  const pages = pdf.getPages();
  pages.forEach((current, index) => {
    current.drawText(`Orçamento #${data.id.slice(0, 8)} | Página ${index + 1} de ${pages.length}`, { x: 40, y: 30, size: 8, font: regular, color: muted });
  });
  pdf.setTitle(`Orçamento #${data.id.slice(0, 8)}`);
  pdf.setAuthor(safeText(data.organizationName, regular));
  return pdf.save();
}
