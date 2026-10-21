import { Workbook, type CellValue } from "exceljs";
import { readOfficialZip } from "./reference-zip";
import { normalizeReference, referenceDate, type ReferenceEntry } from "./reference-types";

export const tissIndexUrl = "https://www.gov.br/ans/pt-br/assuntos/prestadores/padrao-para-troca-de-informacao-de-saude-suplementar-2013-tiss/padrao-para-troca-de-informacao-de-saude-suplementar-2013-tiss";
type TussKind = "tuss-20" | "tuss-22";
function officialUrl(value: string, base: string) {
  const url = new URL(value.replaceAll("&amp;", "&"), base);
  if (url.protocol !== "https:" || !["www.gov.br", "www.ans.gov.br"].includes(url.hostname) || url.username || url.password || url.port) throw new Error("Link de pacote fora dos domínios oficiais da ANS.");
  if (url.hostname === "www.gov.br" && !url.pathname.startsWith("/ans/")) throw new Error("Link fora da área oficial da ANS.");
  return url.href;
}
const links = (html: string) => [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);
async function page(url: string) {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Página TISS respondeu HTTP ${response.status}.`);
  const html = await response.text();
  if (html.length > 5_000_000) throw new Error("Página TISS acima do limite esperado.");
  return html;
}
export function findTissRelease(html: string) {
  const months = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const releases = links(html).flatMap(link => {
    const slug = link.match(/\/padrao-tiss-([a-z]+)-(20\d{2})\/?$/i);
    if (!slug || !months.includes(slug[1].toLowerCase())) return [];
    return [{ url: officialUrl(link, tissIndexUrl), order: Number(slug[2]) * 12 + months.indexOf(slug[1].toLowerCase()) }];
  }).sort((a, b) => b.order - a.order);
  if (!releases.length) throw new Error("Edição vigente do TISS não localizada na página oficial.");
  return releases[0].url;
}
export function findTissPackage(html: string, releaseUrl: string) {
  const packages = [...new Set(links(html).filter(link => /\/Padrao_TISS_Representacao_de_Conceitos_em_Saude_20\d{4}\.zip$/i.test(link)).map(link => officialUrl(link, releaseUrl)))];
  if (packages.length !== 1) throw new Error("Pacote oficial TUSS ausente ou ambíguo.");
  return packages[0];
}
function text(value: CellValue): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "richText" in value) return value.richText.map(part => part.text).join("").trim();
  throw new Error("Tipo de célula inesperado na planilha TUSS (fórmulas não são aceitas).");
}
export async function parseTussWorkbook(kind: TussKind, bytes: Uint8Array, edition: string) {
  if (!/^20\d{2}(0[1-9]|1[0-2])$/.test(edition)) throw new Error("Edição TISS inválida.");
  if (bytes.byteLength > 20_000_000) throw new Error("Planilha TUSS acima do limite esperado.");
  const workbook = new Workbook();
  await workbook.xlsx.load(new Uint8Array(bytes).buffer);
  const candidates = workbook.worksheets.filter(sheet => normalizeReference(sheet.name).includes(edition) && !/^capa$/i.test(sheet.name));
  if (candidates.length !== 1) throw new Error("Planilha TUSS da edição esperada ausente ou ambígua.");
  const sheet = candidates[0], table = kind === "tuss-20" ? "20" : "22";
  let headerRow = 0, columns = new Map<string, number>();
  let titleFound = false;
  for (let row = 1; row <= Math.min(30, sheet.rowCount); row++) {
    const values = new Map<string, number>();
    sheet.getRow(row).eachCell((cell, column) => {
      const value = normalizeReference(text(cell.value));
      if (value.startsWith(`tabela ${table} terminologia`)) titleFound = true;
      values.set(value, column);
    });
    if (values.has("codigo do termo") && values.has("termo")) { headerRow = row; columns = values; break; }
  }
  const required = ["codigo do termo", "termo", "data de inicio de vigencia", "data de fim de vigencia", ...(kind === "tuss-20" ? ["apresentacao", "laboratorio"] : [])];
  if (!titleFound || !headerRow || required.some(column => !columns.has(column))) throw new Error("Tabela/cabeçalhos TUSS incompatíveis com a importação.");
  const entries: ReferenceEntry[] = [];
  for (let row = headerRow + 1; row <= sheet.rowCount; row++) {
    const read = (name: string) => text(sheet.getRow(row).getCell(columns.get(name)!).value);
    const code = read("codigo do termo"), name = read("termo");
    if (!code && !name) continue;
    if (!/^\d{8}$/.test(code) || !name) throw new Error(`Registro TUSS inválido na linha ${row}.`);
    const validFrom = referenceDate(read("data de inicio de vigencia")), validUntil = referenceDate(read("data de fim de vigencia"));
    if (!validFrom) throw new Error(`Vigência inicial TUSS ausente na linha ${row}.`);
    entries.push({ code, name, validFrom, validUntil, active: true, ...(kind === "tuss-20" ? { presentation: read("apresentacao") || null, laboratory: read("laboratorio") || null } : {}) });
  }
  return entries;
}
export async function downloadTussPackage(kind: TussKind) {
  const releaseUrl = findTissRelease(await page(tissIndexUrl));
  const sourceUrl = findTissPackage(await page(releaseUrl), releaseUrl);
  const edition = sourceUrl.match(/_(20\d{4})\.zip$/i)![1];
  const table = kind === "tuss-20" ? "20" : "22";
  const result = await readOfficialZip(sourceUrl, name => new RegExp(`(?:^|/)TUSS ${table} -.*${edition}\\.xlsx$`, "i").test(name));
  const entries = await parseTussWorkbook(kind, result.bytes, edition);
  return { entries, sourceUrl, sourceModifiedAt: result.modifiedAt, version: `ANS-TISS-${edition}`, minimumRows: kind === "tuss-20" ? 40000 : 5000 };
}
