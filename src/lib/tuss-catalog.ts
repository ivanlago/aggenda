import { readFile } from "node:fs/promises";
import path from "node:path";

import Papa from "papaparse";

export type TussCatalogItem = {
  code: string;
  name: string;
  table: "20" | "22";
  validFrom: string | null;
  validUntil: string | null;
  laboratory: string | null;
  presentation: string | null;
};

type CsvRow = {
  id?: string;
  display_name?: string;
  extras_inicio_vigencia?: string;
  extras_fim_vigencia?: string;
  extras_laboratorio?: string;
  extras_apresentacao?: string;
};

const catalogCache = new Map<string, Promise<TussCatalogItem[]>>();

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

async function loadCatalog(table: "20" | "22") {
  const filePath = path.join(process.cwd(), "public", `tuss-${table}.csv`);
  const raw = await readFile(filePath, "utf8");
  const parsed = Papa.parse<CsvRow>(raw, { header: true, delimiter: ";", skipEmptyLines: true });
  return parsed.data.flatMap((row) => {
    const code = String(row.id ?? "").trim();
    const name = String(row.display_name ?? "").trim();
    if (!code || !name) return [];
    return [{
      code,
      name,
      table,
      validFrom: row.extras_inicio_vigencia && row.extras_inicio_vigencia !== "-" ? row.extras_inicio_vigencia : null,
      validUntil: row.extras_fim_vigencia && row.extras_fim_vigencia !== "-" ? row.extras_fim_vigencia : null,
      laboratory: row.extras_laboratorio && row.extras_laboratorio !== "-" ? row.extras_laboratorio.trim() : null,
      presentation: row.extras_apresentacao && row.extras_apresentacao !== "-" ? row.extras_apresentacao.trim() : null,
    } satisfies TussCatalogItem];
  });
}

export async function searchTussCatalog(table: "20" | "22", query: string, limit = 20) {
  const promise = catalogCache.get(table) ?? loadCatalog(table);
  catalogCache.set(table, promise);
  const items = await promise;
  const needle = normalize(query.trim());
  if (needle.length < 2) return [];
  return items
    .filter((item) => item.code.includes(needle) || normalize(item.name).includes(needle) || normalize(item.presentation ?? "").includes(needle) || normalize(item.laboratory ?? "").includes(needle))
    .sort((a, b) => {
      const aExact = a.code === needle || normalize(a.name) === needle;
      const bExact = b.code === needle || normalize(b.name) === needle;
      const aActive = !a.validUntil;
      const bActive = !b.validUntil;
      return Number(bExact) - Number(aExact) || Number(bActive) - Number(aActive) || a.name.localeCompare(b.name, "pt-BR") || (a.presentation ?? "").localeCompare(b.presentation ?? "", "pt-BR");
    })
    .slice(0, limit);
}
