import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type Cell = string | number | null;
export type FinancialDownload = {
  title: string;
  organization: string;
  filters: string[];
  summary: { label: string; cents: number }[];
  columns: { label: string; width: number; kind?: "money" | "date" }[];
  rows: Cell[][];
};

const currencyFormat = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string) => value.split("-").reverse().join("/");

export async function buildFinancialDownloadExcel(report: FinancialDownload) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(report.title);
  sheet.columns = report.columns.map(column => ({ width: Math.max(15, column.width / 5.5) }));
  for (const line of [report.title, report.organization, ...report.filters]) {
    const row = sheet.addRow([line]);
    sheet.mergeCells(row.number, 1, row.number, report.columns.length);
    row.font = { bold: row.number === 1, color: { argb: "FF14443F" } };
  }
  for (const item of report.summary) {
    const row = sheet.addRow([item.label, null, item.cents / 100]);
    sheet.mergeCells(row.number, 1, row.number, 2);
    row.getCell(3).numFmt = currencyFormat;
  }
  sheet.addRow([]);
  const header = sheet.addRow(report.columns.map(column => column.label));
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF00665F" } };
  sheet.views = [{ state: "frozen", ySplit: header.number }];
  sheet.autoFilter = { from: { row: header.number, column: 1 }, to: { row: header.number + report.rows.length, column: report.columns.length } };
  for (const cells of report.rows) {
    const row = sheet.addRow(cells.map((value, index) => {
      const kind = report.columns[index].kind;
      if (kind === "money" && typeof value === "number") return value / 100;
      if (kind === "date" && typeof value === "string") return new Date(value + "T00:00:00Z");
      return value;
    }));
    report.columns.forEach(({ kind }, index) => {
      if (kind) row.getCell(index + 1).numFmt = kind === "money" ? currencyFormat : "dd/mm/yyyy";
    });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function buildFinancialDownloadPdf(report: FinancialDownload) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(font.getCharacterSet());
  const brand = rgb(0, 0.4, 0.37);
  const dark = rgb(0.07, 0.17, 0.2);
  const white = rgb(1, 1, 1);
  const pageSize: [number, number] = [841.89, 595.28];
  const margin = 30;
  const rowWidth = pageSize[0] - 2 * margin;
  const widthSum = report.columns.reduce((total, column) => total + column.width, 0);
  const widths = report.columns.map(column => column.width * rowWidth / widthSum);
  const fontSize = 9;
  const leading = 12;
  let page = pdf.addPage(pageSize);
  let y = 0;

  function wrap(value: string, width: number, size = fontSize) {
    const safe = Array.from(value.normalize("NFC"), char => /\s/u.test(char) ? " " : supported.has(char.codePointAt(0)!) ? char : "?").join("");
    const lines: string[] = [];
    let line = "";
    for (const word of safe.trim().split(/ +/)) {
      const candidate = line ? line + " " + word : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      for (const char of word) {
        if (font.widthOfTextAtSize(line + char, size) > width) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    }
    return [...lines, line];
  }

  const headings = report.columns.map(({ label }, index) => wrap(label, widths[index] - 10));
  const headerHeight = 8 + leading * Math.max(...headings.map(lines => lines.length));
  const maxBodyLines = Math.floor((510 - headerHeight - 42) / leading);

  function pageHeader(first: boolean) {
    page.drawRectangle({ x: 0, y: 531, width: pageSize[0], height: 65, color: brand });
    page.drawText("AGGENDA  /  FINANCEIRO", { x: margin, y: 567, font: bold, size: 9, color: white });
    page.drawText(report.title, { x: margin, y: 544, font: bold, size: 19, color: white });
    y = 510;
    if (first) {
      for (const line of wrap([report.organization, ...report.filters].join("  |  "), rowWidth)) {
        page.drawText(line, { x: margin, y, font, size: fontSize, color: dark });
        y -= leading;
      }
      if (report.summary.length) {
        y -= 6;
        for (const line of wrap(report.summary.map(item => item.label + " " + brl.format(item.cents / 100)).join("  |  "), rowWidth)) {
          page.drawText(line, { x: margin, y, font: bold, size: fontSize, color: dark });
          y -= leading;
        }
      }
      y -= 6;
    }
    page.drawRectangle({ x: margin, y: y - headerHeight, width: rowWidth, height: headerHeight, color: brand });
    let x = margin;
    headings.forEach((lines, index) => {
      lines.forEach((line, row) => page.drawText(line, { x: x + 5, y: y - 13 - row * leading, font: bold, size: fontSize, color: white }));
      x += widths[index];
    });
    y -= headerHeight;
  }

  pageHeader(true);
  if (!report.rows.length) page.drawText("Nenhum registro para os filtros selecionados.", { x: margin + 5, y: y - 15, font, size: fontSize, color: dark });
  for (const [index, cells] of report.rows.entries()) {
    const lines = report.columns.map(({ kind }, column) => {
      const value = cells[column];
      const text = kind === "money" && typeof value === "number" ? brl.format(value / 100)
        : kind === "date" && typeof value === "string" ? date(value) : String(value ?? "—");
      return wrap(text, widths[column] - 10);
    });
    const height = Math.max(...lines.map(cell => cell.length));
    for (let offset = 0; offset < height;) {
      const keepTogether = offset === 0 && height <= maxBodyLines && height * leading > y - 42;
      if (y < 58 || keepTogether) {
        page = pdf.addPage(pageSize);
        pageHeader(false);
      }
      const count = Math.min(height - offset, Math.floor((y - 42) / leading));
      if (index % 2 === 0) page.drawRectangle({ x: margin, y: y - count * leading, width: rowWidth, height: count * leading, color: rgb(0.94, 0.97, 0.97) });
      let x = margin;
      lines.forEach((column, col) => {
        column.slice(offset, offset + count).forEach((line, row) => {
          const rightAligned = report.columns[col].kind === "money";
          const left = rightAligned ? x + widths[col] - 5 - font.widthOfTextAtSize(line, fontSize) : x + 5;
          page.drawText(line, { x: left, y: y - row * leading - 10, font, size: fontSize, color: dark });
        });
        x += widths[col];
      });
      offset += count;
      y -= count * leading;
    }
  }
  const pages = pdf.getPages();
  pages.forEach((item, index) => item.drawText(`Página ${index + 1} de ${pages.length}`, { x: pageSize[0] - 111, y: 24, size: fontSize, font, color: dark }));
  return Buffer.from(await pdf.save());
}
