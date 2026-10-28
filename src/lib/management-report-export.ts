import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatReportCell, type ManagementReport, type ReportCell, type ReportColumn } from "./management-reports";

const issuedAt = (report: ManagementReport) => `${new Date(report.generatedAt).toLocaleString("pt-BR", { timeZone: report.timezone ?? "UTC" })} (${report.timezone ?? "UTC"})`;

export async function managementReportExcel(report: ManagementReport) {
  const book = new ExcelJS.Workbook();
  book.creator = "Aggenda";
  book.created = new Date(report.generatedAt);
  const cover = book.addWorksheet("Informações");
  [report.title, report.organization, `Emitido em: ${issuedAt(report)}`, ...report.filters, ...report.notes].forEach(value => cover.addRow([value]));
  cover.getColumn(1).width = 110;
  cover.eachRow(row => { row.alignment = { wrapText: true, vertical: "top" }; row.height = 38; });
  cover.getRow(1).font = { bold: true, size: 16 };
  report.tables.forEach((table, index) => {
    const sheet = book.addWorksheet(`${index + 1} ${table.title}`.replace(/[\[\]*?:/\\]/g, " ").slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.addRow(table.columns.map(column => column.title));
    for (const row of table.rows) sheet.addRow(row.map((value, i) => {
      if (value === null) return null;
      if (table.columns[i].kind === "date") return new Date(`${value}T12:00:00Z`);
      if (table.columns[i].kind === "percent") return Number(value) / 100;
      // Strings are written as strings, never as Excel formulas.
      return value;
    }));
    sheet.columns.forEach((column, i) => {
      const kind = table.columns[i].kind;
      column.width = kind === "money" ? 22 : 24 * (table.columns[i].width ?? 1);
      if (kind === "money") column.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
      if (kind === "date") column.numFmt = "dd/mm/yyyy";
      if (kind === "percent") column.numFmt = "0.0%";
      column.alignment = { vertical: "top", wrapText: true };
    });
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF18664A" } };
    sheet.getRow(1).height = 34;
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: table.columns.length } };
  });
  return new Uint8Array(await book.xlsx.writeBuffer());
}

export async function managementReportPdf(report: ManagementReport) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const color = rgb(0.09, 0.4, 0.29);
  // Standard PDF fonts support Portuguese. Unsupported symbols in user input
  // are replaced instead of failing the entire export.
  const clean = (value: string) => Array.from(value.replace(/[\r\n\t]+/g, " ")).map(char => { try { regular.encodeText(char); return char; } catch { return "?"; } }).join("");
  function wrap(value: string, width: number, size = 8) {
    const lines: string[] = [];
    let line = "";
    for (const word of clean(value).split(/\s+/)) {
      if (line && regular.widthOfTextAtSize(`${line} ${word}`, size) <= width) { line += ` ${word}`; continue; }
      if (line) { lines.push(line); line = ""; }
      for (const char of word) {
        if (regular.widthOfTextAtSize(line + char, size) > width && line) { lines.push(line); line = ""; }
        line += char;
      }
    }
    lines.push(line);
    return lines;
  }
  let page = document.addPage([842, 595]), y = 0;
  function header() {
    page.drawRectangle({ x: 0, y: 531, width: 842, height: 64, color });
    page.drawText(clean(`Aggenda | ${report.title}`), { x: 30, y: 566, size: 16, font: bold, color: rgb(1, 1, 1) });
    page.drawText(clean(report.organization).slice(0, 110), { x: 30, y: 546, size: 10, font: regular, color: rgb(1, 1, 1) });
    y = 511;
  }
  function next() { page = document.addPage([842, 595]); header(); }
  function paragraph(value: string, size = 9) {
    for (const line of wrap(value, 782, size)) {
      if (y < 38) next();
      page.drawText(line, { x: 30, y, size, font: regular }); y -= size + 5;
    }
    y -= 5;
  }
  header();
  paragraph(`Emitido em: ${issuedAt(report)}`);
  [...report.filters, ...report.notes].forEach(value => paragraph(value));
  for (const table of report.tables) {
    if (y < 115) next();
    paragraph(`${table.title} (${table.rows.length} registros)`, 11);
    const totalWeight = table.columns.reduce((sum, column) => sum + (column.width ?? 1), 0);
    const widths = table.columns.map(column => 782 * (column.width ?? 1) / totalWeight);
    function rowLines(row: ReportCell[], columns: ReportColumn[]) { return row.map((value, index) => wrap(formatReportCell(value, columns[index]), widths[index] - 12)); }
    function drawLines(lines: string[][], offset: number, count: number, heading = false) {
      const height = count * 12 + 10;
      page.drawRectangle({ x: 30, y: y - height, width: 782, height, color: heading ? color : rgb(0.96, 0.98, 0.97), borderColor: rgb(0.85, 0.89, 0.87), borderWidth: 0.4 });
      let x = 36;
      lines.forEach((cell, i) => {
        cell.slice(offset, offset + count).forEach((line, lineIndex) => page.drawText(line, { x, y: y - 14 - lineIndex * 12, size: 8, font: heading ? bold : regular, color: heading ? rgb(1, 1, 1) : rgb(0.1, 0.17, 0.15) }));
        x += widths[i];
      });
      y -= height;
    }
    const headings = table.columns.map((column, i) => wrap(column.title, widths[i] - 12));
    const drawHead = () => drawLines(headings, 0, Math.max(...headings.map(cell => cell.length)), true);
    drawHead();
    if (!table.rows.length) paragraph("Nenhum registro encontrado para os filtros.");
    for (const row of table.rows) {
      const lines = rowLines(row, table.columns), count = Math.max(...lines.map(cell => cell.length));
      const rowHeight = count * 12 + 10;
      const headerHeight = Math.max(...headings.map(cell => cell.length)) * 12 + 10;
      // Keep ordinary rows together. Only a row taller than a complete page
      // continues across pages, with the column header repeated.
      if (rowHeight > y - 38 && rowHeight <= 511 - headerHeight - 38) { next(); drawHead(); }
      let offset = 0;
      while (offset < count) {
        if (y < 62) { next(); drawHead(); }
        const available = Math.max(1, Math.floor((y - 45) / 12));
        const chunk = Math.min(count - offset, available);
        drawLines(lines, offset, chunk); offset += chunk;
        if (offset < count) { next(); drawHead(); }
      }
    }
    y -= 24;
  }
  const pages = document.getPages();
  pages.forEach((sheet, index) => sheet.drawText(`Aggenda | ${index + 1} / ${pages.length}`, { x: 30, y: 18, size: 8, font: regular }));
  document.setTitle(report.title);
  document.setAuthor("Aggenda");
  document.setCreationDate(new Date(report.generatedAt));
  return document.save();
}
