import { readFile } from "node:fs/promises";
import path from "node:path";

import Papa from "papaparse";

export type CidCatalogItem = {
  code: string;
  description: string;
  abbreviatedDescription: string;
};

type CsvRow = {
  SUBCAT?: string;
  DESCRICAO?: string;
  DESCRABREV?: string;
};

let catalogPromise: Promise<CidCatalogItem[]> | undefined;

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function formatCode(value: string) {
  const code = value.trim().toUpperCase();
  return code.length > 3 && !code.includes(".") ? `${code.slice(0, 3)}.${code.slice(3)}` : code;
}

async function loadCatalog() {
  const filePath = path.join(process.cwd(), "public", "CID-10-SUBCATEGORIAS.CSV");
  const bytes = await readFile(filePath);
  const raw = new TextDecoder("windows-1252").decode(bytes);
  const parsed = Papa.parse<CsvRow>(raw, { header: true, delimiter: ";", skipEmptyLines: true });

  return parsed.data.flatMap((row) => {
    const code = formatCode(String(row.SUBCAT ?? ""));
    const description = String(row.DESCRICAO ?? "").trim();
    if (!code || !description) return [];
    return [{ code, description, abbreviatedDescription: String(row.DESCRABREV ?? "").trim() }];
  });
}

export async function searchCidCatalog(query: string, limit = 30) {
  catalogPromise ??= loadCatalog();
  const items = await catalogPromise;
  const needle = normalize(query.trim().replace(".", ""));
  if (needle.length < 2) return [];

  return items
    .filter((item) => normalize(`${item.code.replace(".", "")} ${item.description} ${item.abbreviatedDescription}`).includes(needle))
    .sort((a, b) => {
      const aCode = normalize(a.code.replace(".", ""));
      const bCode = normalize(b.code.replace(".", ""));
      return Number(bCode === needle) - Number(aCode === needle)
        || Number(bCode.startsWith(needle)) - Number(aCode.startsWith(needle))
        || a.code.localeCompare(b.code, "pt-BR");
    })
    .slice(0, limit);
}
