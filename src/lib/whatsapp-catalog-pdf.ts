import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function buildWhatsAppCatalogPdf(data: { name: string; updatedAt: string; products: { label: string; priceInCents: number; description?: string | null; thumbnail?: Uint8Array }[] }) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.12, 0.38, 0.29);
  const safe = (value: string) => [...value].map(char => { try { regular.encodeText(char); return char; } catch { return "?"; } }).join("");
  let page = pdf.addPage([595.28, 841.89]);
  let y = 790;
  const addPage = () => { page = pdf.addPage([595.28, 841.89]); y = 790; };
  const line = (value: string, size = 11, heading = false) => {
    let text = "";
    const font = heading ? bold : regular;
    const draw = () => {
      if (y < 75) addPage();
      page.drawText(text, { x: 42, y, size, font, color: heading ? green : rgb(0.15, 0.18, 0.17) });
      y -= size + 8; text = "";
    };
    for (const char of safe(value.replace(/\s+/g, " "))) {
      if (font.widthOfTextAtSize(text + char, size) > 510) draw();
      text += char;
    }
    if (text) draw();
  };
  line(data.name, 19, true);
  line("Catálogo de produtos", 23, true);
  line(`Atualizado em ${data.updatedAt}`, 10);
  y -= 10;
  line("Consulte disponibilidade e confirme o valor com nossa equipe antes de concluir a compra. Os preços podem sofrer alterações.", 10);
  y -= 15;
  if (!data.products.length) line("Nenhum produto disponível para venda neste momento.");
  for (const [index, product] of data.products.entries()) {
    if (y < 135) addPage();
    line(`${index + 1}. ${product.label}`, 12, true);
    if (product.thumbnail) {
      try {
        const image = await pdf.embedJpg(product.thumbnail);
        if (y < 150) addPage();
        const dimensions = image.scaleToFit(64, 64);
        page.drawImage(image, { x: 42, y: y - dimensions.height, width: dimensions.width, height: dimensions.height });
        y -= dimensions.height + 12;
      } catch { /* A missing photo must never prevent catalog delivery. */ }
    }
    if (product.description) line(product.description.slice(0, 350), 10);
    line((product.priceInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
    y -= 12;
  }
  for (const [index, sheet] of pdf.getPages().entries()) sheet.drawText(`Aggenda | ${index + 1}/${pdf.getPageCount()}`, { x: 42, y: 35, size: 9, font: regular, color: green });
  return pdf.save();
}
