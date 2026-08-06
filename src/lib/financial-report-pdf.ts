import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type FinancialReportEntry = {
  dueDate: string;
  realizedDate: string | null;
  type: string;
  status: string;
  source: string;
  description: string;
  category: string | null;
  amountInCents: number;
};

type ReportSummary = {
  received: number;
  paid: number;
  receivable: number;
  payable: number;
};

const brand = rgb(24 / 255, 102 / 255, 74 / 255);
const dark = rgb(24 / 255, 39 / 255, 34 / 255);
const muted = rgb(93 / 255, 107 / 255, 101 / 255);
const light = rgb(243 / 255, 247 / 255, 244 / 255);
const border = rgb(218 / 255, 226 / 255, 220 / 255);
const green = rgb(20 / 255, 120 / 255, 75 / 255);
const red = rgb(181 / 255, 54 / 255, 54 / 255);

const money = (value: number) =>
  (value / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const date = (value: string | null) => {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
};

const monthLabel = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
};

function fitText(text: string, font: PDFFont, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && font.widthOfTextAtSize(`${result}...`, size) > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}...`;
}

function drawPageHeader({
  page,
  bold,
  regular,
  organizationName,
  month,
}: {
  page: PDFPage;
  bold: PDFFont;
  regular: PDFFont;
  organizationName: string;
  month: string;
}) {
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: height - 92, width, height: 92, color: brand });
  page.drawText("AGGENDA", { x: 36, y: height - 38, size: 11, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Extrato do fluxo de caixa", { x: 36, y: height - 61, size: 20, font: bold, color: rgb(1, 1, 1) });
  page.drawText(fitText(organizationName, regular, 10, 230), { x: width - 266, y: height - 38, size: 10, font: regular, color: rgb(1, 1, 1) });
  page.drawText(monthLabel(month), { x: width - 266, y: height - 59, size: 10, font: regular, color: rgb(1, 1, 1) });
}

function drawSummaryCard(page: PDFPage, bold: PDFFont, regular: PDFFont, x: number, y: number, width: number, label: string, value: number, color = dark) {
  page.drawRectangle({ x, y, width, height: 55, color: light, borderColor: border, borderWidth: 0.7 });
  page.drawText(label, { x: x + 12, y: y + 34, size: 8, font: regular, color: muted });
  page.drawText(money(value), { x: x + 12, y: y + 14, size: 13, font: bold, color });
}

export async function buildFinancialReportPdf({
  organizationName,
  month,
  generatedAt,
  entries,
  summary,
}: {
  organizationName: string;
  month: string;
  generatedAt: Date;
  entries: FinancialReportEntry[];
  summary: ReportSummary;
}) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  let page = document.addPage(pageSize);
  drawPageHeader({ page, bold, regular, organizationName, month });

  const margin = 36;
  const gap = 10;
  const cardWidth = (pageSize[0] - margin * 2 - gap) / 2;
  drawSummaryCard(page, bold, regular, margin, 677, cardWidth, "Recebido no período", summary.received, green);
  drawSummaryCard(page, bold, regular, margin + cardWidth + gap, 677, cardWidth, "Pago no período", summary.paid, red);
  drawSummaryCard(page, bold, regular, margin, 612, cardWidth, "A receber (previsão)", summary.receivable, green);
  drawSummaryCard(page, bold, regular, margin + cardWidth + gap, 612, cardWidth, "A pagar (previsão)", summary.payable, red);
  page.drawText(`Saldo realizado: ${money(summary.received - summary.paid)}   |   Saldo previsto: ${money(summary.receivable - summary.payable)}`, {
    x: margin,
    y: 588,
    size: 9,
    font: bold,
    color: dark,
  });

  const columns = [
    { label: "Venc.", x: 36, width: 57 },
    { label: "Tipo", x: 96, width: 62 },
    { label: "Descrição", x: 161, width: 205 },
    { label: "Status", x: 369, width: 75 },
    { label: "Valor", x: 447, width: 111 },
  ];
  let y = 552;

  const drawTableHeader = () => {
    page.drawRectangle({ x: margin, y: y - 4, width: pageSize[0] - margin * 2, height: 25, color: brand });
    for (const column of columns) {
      page.drawText(column.label, { x: column.x + 4, y: y + 5, size: 8, font: bold, color: rgb(1, 1, 1) });
    }
    y -= 22;
  };
  drawTableHeader();

  const statusLabel = (entry: FinancialReportEntry) => {
    if (entry.status === "pending") return "Pendente";
    if (entry.status === "cancelled") return "Cancelado";
    return entry.type === "payable" ? "Pago" : "Recebido";
  };

  for (const [index, entry] of entries.entries()) {
    if (y < 65) {
      page = document.addPage(pageSize);
      drawPageHeader({ page, bold, regular, organizationName, month });
      y = 714;
      drawTableHeader();
    }
    if (index % 2 === 0) {
      page.drawRectangle({ x: margin, y: y - 10, width: pageSize[0] - margin * 2, height: 29, color: light });
    }
    const values = [
      date(entry.dueDate),
      entry.type === "payable" ? "A pagar" : "A receber",
      entry.description,
      statusLabel(entry),
      `${entry.type === "payable" ? "-" : "+"} ${money(entry.amountInCents)}`,
    ];
    values.forEach((value, columnIndex) => {
      const column = columns[columnIndex];
      const text = fitText(value, columnIndex === 4 ? bold : regular, 8, column.width - 8);
      page.drawText(text, {
        x: column.x + 4,
        y,
        size: 8,
        font: columnIndex === 4 ? bold : regular,
        color: columnIndex === 4 ? (entry.type === "payable" ? red : green) : dark,
      });
    });
    y -= 29;
  }

  if (!entries.length) {
    page.drawText("Nenhum lançamento encontrado no período.", { x: margin + 8, y, size: 10, font: regular, color: muted });
  }

  const pages = document.getPages();
  pages.forEach((currentPage, index) => {
    const footer = `Gerado em ${generatedAt.toLocaleString("pt-BR")}  |  Página ${index + 1} de ${pages.length}`;
    currentPage.drawLine({ start: { x: margin, y: 35 }, end: { x: pageSize[0] - margin, y: 35 }, thickness: 0.5, color: border });
    currentPage.drawText(footer, { x: margin, y: 21, size: 7, font: regular, color: muted });
  });
  document.setTitle(`Extrato financeiro - ${organizationName} - ${month}`);
  document.setAuthor("Aggenda");
  return document.save();
}
