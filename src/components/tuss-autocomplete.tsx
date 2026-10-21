"use client";

import { useEffect, useId, useState } from "react";
import type { CatalogReference } from "@/lib/reference-types";

export type TussItem = { code: string; name: string; table: "20" | "22" | null; validFrom?: string | null; validUntil: string | null; laboratory: string | null; presentation: string | null; source?: "tuss" | "anvisa"; substance?: string | null; registrationStatus?: string | null; eligible?: boolean; reference?: CatalogReference };

export function TussAutocomplete({
  table,
  label,
  nameField,
  defaultCode = "",
  defaultName = "",
  onSelectNameField,
  onSelectCodeField,
  appendToField,
  onSelect,
  onCustom,
  resetAfterSelect = false,
  medicationCatalog = false,
}: {
  table: "20" | "22";
  label: string;
  nameField?: string;
  defaultCode?: string;
  defaultName?: string;
  onSelectNameField?: string;
  onSelectCodeField?: string;
  appendToField?: string;
  onSelect?: (item: TussItem) => void;
  onCustom?: (name: string) => void;
  resetAfterSelect?: boolean;
  medicationCatalog?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState(defaultCode && defaultName ? `${defaultCode} - ${defaultName}` : "");
  const [items, setItems] = useState<TussItem[]>([]);
  const [selected, setSelected] = useState<{ code: string; name: string; reference?: CatalogReference }>({ code: defaultCode, name: defaultName });
  const [available, setAvailable] = useState(true);
  const [source, setSource] = useState<"tuss" | "anvisa">(medicationCatalog ? "anvisa" : "tuss");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [importedAt, setImportedAt] = useState("");
  const [legacyVersion, setLegacyVersion] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2 || (selected.code && query.startsWith(`${selected.code} - ${selected.name}`))) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/reference/${source === "anvisa" ? "medications" : "tuss"}?table=${table}&q=${encodeURIComponent(query)}&page=${page}&includeInactive=${includeInactive}`, { signal: controller.signal });
        const data = await response.json() as { items?: TussItem[]; available?: boolean; hasMore?: boolean; catalog?: { importedAt: string; version: string } };
        if (controller.signal.aborted) return;
        setAvailable(data.available !== false);
        setItems(data.items ?? []);
        setHasMore(data.hasMore ?? false);
        setImportedAt(data.catalog?.importedAt ?? "");
        setLegacyVersion(data.catalog?.version.startsWith("arquivo-legado-") ?? false);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setAvailable(false);
        setItems([]);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, selected, table, source, page, includeInactive]);

  function choose(item: TussItem) {
    if (item.eligible === false) return;
    setSelected({ code: item.code, name: item.name, reference: item.reference });
    setQuery(resetAfterSelect ? "" : `${item.code} - ${item.name}${item.presentation ? ` · ${item.presentation}` : ""}`);
    setItems([]);
    onSelect?.(item);
    if (onSelectNameField) {
      const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${onSelectNameField}"]`);
      if (input) input.value = item.name;
    }
    if (onSelectCodeField) {
      const input = document.querySelector<HTMLInputElement>(`[name="${onSelectCodeField}"]`);
      if (input) input.value = item.code;
    }
    if (appendToField) {
      const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${appendToField}"]`);
      if (input) input.value = `${input.value}${input.value.trim() ? "\n" : ""}${item.name}${item.presentation ? ` · ${item.presentation}` : ""} [TUSS ${item.code}] - `;
    }
  }

  return <div className="relative grid gap-1">
    {medicationCatalog && <label className="grid gap-1 text-sm font-bold">Catálogo<select className="field" value={source} onChange={event => { setSource(event.target.value as "tuss" | "anvisa"); setSelected({ code: "", name: "" }); setItems([]); setPage(1); }}><option value="anvisa">Medicamentos — Anvisa</option><option value="tuss">Medicamentos — TUSS 20</option></select></label>}
    <label className="text-sm font-bold" htmlFor={id}>{label}</label>
    <input id={id} className="field" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); setSelected({ code: "", name: "" }); setItems([]); }} onKeyDown={(event) => { if (event.key !== "Enter" || query.trim().length < 2) return; event.preventDefault(); if (items[0]) choose(items[0]); else if (onCustom) { onCustom(query.trim()); setQuery(""); setItems([]); } }} placeholder={table === "22" ? "Digite código ou nome do procedimento" : "Digite código ou nome do medicamento"} autoComplete="off" />
    <input type="hidden" name={nameField ?? "tussCode"} value={selected.code} />
    <input type="hidden" name={nameField ? `${nameField}Name` : "tussName"} value={selected.name} />
    <input type="hidden" name={nameField ? `${nameField}Table` : "tussTable"} value={selected.code && source === "tuss" ? table : ""} />
    <input type="hidden" name={nameField ? `${nameField}Reference` : "tussReference"} value={selected.reference ? JSON.stringify(selected.reference) : ""} />
    {!available && <p className="text-xs font-bold text-amber-700">Catálogo indisponível. O preenchimento manual continua disponível.</p>}
    {source === "anvisa" && <p className="text-xs text-muted">Registro e princípio ativo da Anvisa. Confira concentração e apresentação na embalagem; este catálogo não informa todas as apresentações. Registros com situações divergentes ficam disponíveis apenas para consulta.</p>}
    <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={includeInactive} onChange={event => { setIncludeInactive(event.target.checked); setPage(1); setItems([]); }} />Consultar também itens fora de vigência ou inativos</label>
    {importedAt && <p className="text-xs text-muted">Base importada em {new Date(importedAt).toLocaleDateString("pt-BR", { timeZone: "America/Bahia" })}</p>}
    {legacyVersion && <p className="text-xs text-amber-700">Versão oficial do arquivo de origem ainda não confirmada.</p>}
    {onCustom && <p className="text-xs text-muted">Selecione uma sugestão. Se não encontrar, digite o nome e pressione Enter.</p>}
    {items.length > 0 && <ul className="absolute top-full z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border bg-white p-1 shadow-xl">
      {items.map((item) => <li key={`${item.source}-${item.code}`}><button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-60" type="button" disabled={item.eligible === false} onClick={() => choose(item)}><strong>{item.code}</strong><span className="block text-xs text-muted">{item.name}{item.substance ? ` · ${item.substance}` : ""}{item.presentation ? ` · ${item.presentation}` : ""}{item.laboratory ? ` · ${item.laboratory}` : ""}{item.registrationStatus ? ` · ${item.registrationStatus}` : ""}{item.eligible === false ? ` · Somente consulta${item.validFrom || item.validUntil ? ` · Vigência: ${item.validFrom?.split("-").reverse().join("/") ?? "sem início informado"} a ${item.validUntil?.split("-").reverse().join("/") ?? "sem término informado"}` : ""}` : ""}</span></button></li>)}
      <li className="flex items-center justify-between gap-2 p-2"><button type="button" className="secondary-button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Anterior</button><span className="text-xs">Página {page}</span><button type="button" className="secondary-button" disabled={!hasMore} onClick={() => setPage(value => value + 1)}>Próxima</button></li>
    </ul>}
  </div>;
}
