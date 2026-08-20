"use client";

import { useEffect, useId, useState } from "react";

export type TussItem = { code: string; name: string; table: "20" | "22"; validUntil: string | null; laboratory: string | null; presentation: string | null };

export function TussAutocomplete({
  table,
  label,
  nameField,
  defaultCode = "",
  defaultName = "",
  onSelectNameField,
  appendToField,
  onSelect,
}: {
  table: "20" | "22";
  label: string;
  nameField?: string;
  defaultCode?: string;
  defaultName?: string;
  onSelectNameField?: string;
  appendToField?: string;
  onSelect?: (item: TussItem) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState(defaultCode && defaultName ? `${defaultCode} - ${defaultName}` : "");
  const [items, setItems] = useState<TussItem[]>([]);
  const [selected, setSelected] = useState({ code: defaultCode, name: defaultName });
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    if (query.trim().length < 2 || (selected.code && query.startsWith(`${selected.code} - ${selected.name}`))) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/reference/tuss?table=${table}&q=${encodeURIComponent(query)}`, { signal: controller.signal });
        const data = await response.json() as { items?: TussItem[]; available?: boolean };
        setAvailable(data.available !== false);
        setItems(data.items ?? []);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setAvailable(false);
        setItems([]);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, selected, table]);

  function choose(item: TussItem) {
    setSelected({ code: item.code, name: item.name });
    setQuery(`${item.code} - ${item.name}${item.presentation ? ` · ${item.presentation}` : ""}`);
    setItems([]);
    onSelect?.(item);
    if (onSelectNameField) {
      const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${onSelectNameField}"]`);
      if (input) input.value = item.name;
    }
    if (appendToField) {
      const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${appendToField}"]`);
      if (input) input.value = `${input.value}${input.value.trim() ? "\n" : ""}${item.name}${item.presentation ? ` · ${item.presentation}` : ""} [TUSS ${item.code}] - `;
    }
  }

  return <div className="relative grid gap-1">
    <label className="text-sm font-bold" htmlFor={id}>{label}</label>
    <input id={id} className="field" value={query} onChange={(event) => { setQuery(event.target.value); setSelected({ code: "", name: "" }); setItems([]); }} placeholder={table === "22" ? "Digite código ou nome do procedimento" : "Digite código ou nome do medicamento"} autoComplete="off" />
    <input type="hidden" name={nameField ?? "tussCode"} value={selected.code} />
    <input type="hidden" name={nameField ? `${nameField}Name` : "tussName"} value={selected.name} />
    <input type="hidden" name={nameField ? `${nameField}Table` : "tussTable"} value={selected.code ? table : ""} />
    {!available && <p className="text-xs font-bold text-amber-700">Catálogo TUSS {table} ainda não instalado. O preenchimento manual continua disponível.</p>}
    {items.length > 0 && <ul className="absolute top-full z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border bg-white p-1 shadow-xl">
      {items.map((item) => <li key={`${item.table}-${item.code}`}><button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" type="button" onClick={() => choose(item)}><strong>{item.code}</strong><span className="block text-xs text-muted">{item.name}{item.presentation ? ` · ${item.presentation}` : ""}{item.laboratory ? ` · ${item.laboratory}` : ""}{item.validUntil ? ` · vigência encerrada em ${item.validUntil}` : ""}</span></button></li>)}
    </ul>}
  </div>;
}
