import Papa from "papaparse";
import { referenceDate, normalizeReference, type ReferenceEntry, type ReferenceKind } from "./reference-types";

export const oclBase = "https://consulta-ocl.apps.sa-1a.mendixcloud.com/rest/oclservice/ANS";
export const anvisaUrl = "https://dados.anvisa.gov.br/dados/DADOS_ABERTOS_MEDICAMENTOS.csv";
export const cidSourceUrl = "https://datasus.saude.gov.br/transferencia-de-arquivos/";
type CsvRow = Record<string, string>;
const optional = (value?: string) => value?.trim() && value.trim() !== "-" ? value.trim() : null;

function csvRows(raw: string, headers: string[], backslashEscapes = false, literalQuotes = false) {
  const parsed = Papa.parse<CsvRow>(raw.replace(/^\uFEFF/, ""), { header: true, delimiter: ";", quoteChar: literalQuotes ? "\u0000" : '"', escapeChar: backslashEscapes ? "\\" : '"', skipEmptyLines: "greedy" });
  if (parsed.errors.length || headers.some(key => !parsed.meta.fields?.includes(key))) throw new Error("Formato de catálogo inesperado; importação cancelada.");
  return parsed.data;
}

export function parseReferenceCsv(kind: ReferenceKind, bytes: Uint8Array): ReferenceEntry[] {
  const raw = new TextDecoder(kind === "cid-10" || kind === "anvisa-medications" ? "windows-1252" : "utf-8", { fatal: true }).decode(bytes);
  if (kind === "cid-10") return csvRows(raw, ["SUBCAT", "DESCRICAO", "DESCRABREV"], false, true).map(row => ({ code: row.SUBCAT.length > 3 && !row.SUBCAT.includes(".") ? `${row.SUBCAT.slice(0, 3)}.${row.SUBCAT.slice(3)}` : row.SUBCAT, name: row.DESCRICAO, abbreviatedName: row.DESCRABREV, active: true }));
  if (kind === "anvisa-medications") {
    const rows = csvRows(raw, ["NOME_PRODUTO", "NUMERO_REGISTRO_PRODUTO", "NUMERO_PROCESSO", "EMPRESA_DETENTORA_REGISTRO", "SITUACAO_REGISTRO", "PRINCIPIO_ATIVO"]);
    const groups = new Map<string, ReferenceEntry[]>();
    for (const row of rows) {
      const entry: ReferenceEntry = {
      // Registration/process IDs are namespaced and never treated as TUSS codes.
      code: optional(row.NUMERO_REGISTRO_PRODUTO) ? `registro:${row.NUMERO_REGISTRO_PRODUTO.trim()}` : optional(row.NUMERO_PROCESSO) ? `processo:${row.NUMERO_PROCESSO.trim()}` : "",
      name: row.NOME_PRODUTO, laboratory: optional(row.EMPRESA_DETENTORA_REGISTRO), substance: optional(row.PRINCIPIO_ATIVO),
      registrationStatus: row.SITUACAO_REGISTRO, active: normalizeReference(row.SITUACAO_REGISTRO) === "ativo",
      };
      if (entry.code) groups.set(entry.code, [...(groups.get(entry.code) ?? []), entry]);
    }
    return [...groups.values()].map(entries => {
      const unique = [...new Map(entries.map(entry => [JSON.stringify(entry), entry])).values()];
      if (unique.length === 1) return unique[0];
      const combined = (field: "name" | "laboratory" | "substance") => [...new Set(unique.map(entry => entry[field]).filter(Boolean))].sort().join(" / ");
      // The official file can repeat one registration with both Ativo and Inativo.
      // Never infer a global active registration or choose one conflicting row.
      return { code: unique[0].code, name: combined("name"), laboratory: combined("laboratory"), substance: combined("substance"), registrationStatus: "Divergente — conferir situação na Anvisa", active: false };
    });
  }
  return csvRows(raw, ["id", "display_name", "extras_inicio_vigencia", "extras_fim_vigencia"], true).map(row => ({ code: row.id, name: row.display_name, laboratory: optional(row.extras_laboratorio), presentation: optional(row.extras_apresentacao), validFrom: referenceDate(row.extras_inicio_vigencia), validUntil: referenceDate(row.extras_fim_vigencia), active: true }));
}

async function officialResponse(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000), cache: "no-store", redirect: "error" });
  if (!response.ok) throw new Error(`Fonte oficial respondeu HTTP ${response.status}.`);
  if (Number(response.headers.get("content-length") ?? 0) > 100_000_000) throw new Error("Catálogo acima do limite de importação.");
  return response;
}

async function officialJson<T>(url: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await (await officialResponse(url)).json() as T; }
    catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw lastError;
}

export async function downloadReferenceCatalog(kind: Exclude<ReferenceKind, "cid-10">, onProgress?: (loaded: number, total: number) => void) {
  if (kind === "anvisa-medications") {
    const response = await officialResponse(anvisaUrl);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 100_000_000) throw new Error("Catálogo acima do limite de importação.");
    return { entries: parseReferenceCsv(kind, bytes), sourceUrl: anvisaUrl, sourceModifiedAt: response.headers.get("last-modified"), minimumRows: 10000 };
  }
  const sourceUrl = `${oclBase}/concepts/${kind}`;
  const sources = await officialJson<Array<{ Codigo: string; Total_sources: number }>>(`${oclBase}/source`);
  const expected = sources.find(source => source.Codigo === kind)?.Total_sources;
  if (!Number.isSafeInteger(expected) || !expected || expected < 1000) throw new Error("Contagem oficial TUSS indisponível.");
  const entries: ReferenceEntry[] = [];
  const seen = new Set<string>();
  type OclRow = { id: string; source: string; display_name: string; extras?: Record<string, string> };
  const first = await officialJson<OclRow[]>(`${sourceUrl}?page=1`);
  if (!Array.isArray(first) || !first.length) throw new Error("Catálogo TUSS vazio.");
  const pageCount = Math.ceil(expected / first.length);
  if (pageCount > 5000) throw new Error("Paginação TUSS acima do limite esperado.");
  for (let page = 1; page <= pageCount; page += 4) {
    const pages = await Promise.all(Array.from({ length: Math.min(4, pageCount - page + 1) }, async (_, index) => {
      const number = page + index;
      return number === 1 ? first : await officialJson<OclRow[]>(`${sourceUrl}?page=${number}`);
    }));
    for (const rows of pages) {
      if (!Array.isArray(rows) || !rows.length) throw new Error("Página TUSS vazia durante a importação.");
      for (const row of rows) {
        if (row.source !== kind || seen.has(row.id)) throw new Error("Paginação TUSS inconsistente; versão anterior preservada.");
        seen.add(row.id);
        entries.push({ code: row.id, name: row.display_name, validFrom: referenceDate(row.extras?.inicio_vigencia), validUntil: referenceDate(row.extras?.fim_vigencia), laboratory: optional(row.extras?.laboratorio), presentation: optional(row.extras?.apresentacao), active: true });
      }
    }
    onProgress?.(entries.length, expected);
  }
  const finalSources = await officialJson<typeof sources>(`${oclBase}/source`);
  if (entries.length !== expected || finalSources.find(source => source.Codigo === kind)?.Total_sources !== expected) throw new Error("Download incompleto ou fonte alterada durante a importação.");
  return { entries, sourceUrl, sourceModifiedAt: null, minimumRows: expected };
}
