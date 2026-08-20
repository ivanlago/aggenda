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

function matchesMedicalAlias(name: string, needle: string) {
  if (needle.includes("ressonancia magnetica")) return /(^|[^a-z])rm([^a-z]|$)/.test(name) || name.includes("ressonancia magnetica");
  if (needle.includes("tomografia computadorizada")) return /(^|[^a-z])tc([^a-z]|$)/.test(name) || name.includes("tomografia computadorizada");
  if (needle.includes("radiografia") || needle === "raio x" || needle === "raios x") return /(^|[^a-z])rx([^a-z]|$)/.test(name) || name.includes("radiografia");
  if (needle.includes("ultrassonografia") || needle.includes("ultrassom")) return /(^|[^a-z])us([^a-z]|$)/.test(name) || name.includes("ultrassonografia") || name.includes("ultrassom");
  return false;
}

export async function searchTussCatalog(table: "20" | "22", query: string, limit = 100) {
  const promise = catalogCache.get(table) ?? loadCatalog(table);
  catalogCache.set(table, promise);
  const items = await promise;
  const needle = normalize(query.trim());
  if (needle.length < 2) return [];
  return items
    .filter((item) => {
      const normalizedName = normalize(item.name);
      return item.code.includes(needle) || normalizedName.includes(needle) || matchesMedicalAlias(normalizedName, needle) || normalize(item.presentation ?? "").includes(needle) || normalize(item.laboratory ?? "").includes(needle);
    })
    .sort((a, b) => {
      const aExact = a.code === needle || normalize(a.name) === needle;
      const bExact = b.code === needle || normalize(b.name) === needle;
      const aliasPrefix = needle.includes("ressonancia magnetica") ? "rm -" : needle.includes("tomografia computadorizada") ? "tc -" : needle.includes("radiografia") || needle.includes("raio x") ? "rx -" : needle.includes("ultrassonografia") || needle.includes("ultrassom") ? "us -" : "";
      const aAliasPrimary = Boolean(aliasPrefix) && normalize(a.name).startsWith(aliasPrefix);
      const bAliasPrimary = Boolean(aliasPrefix) && normalize(b.name).startsWith(aliasPrefix);
      const aActive = !a.validUntil;
      const bActive = !b.validUntil;
      return Number(bExact) - Number(aExact) || Number(bAliasPrimary) - Number(aAliasPrimary) || Number(bActive) - Number(aActive) || a.name.localeCompare(b.name, "pt-BR") || (a.presentation ?? "").localeCompare(b.presentation ?? "", "pt-BR");
    })
    .slice(0, limit);
}
