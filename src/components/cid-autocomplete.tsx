"use client";

import { useEffect, useId, useState } from "react";
import type { CatalogReference } from "@/lib/reference-types";

export type CidItem = { code: string; description: string; abbreviatedDescription: string; reference?: CatalogReference };

export function CidAutocomplete({ onSelect }: { onSelect: (item: CidItem) => void }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CidItem[]>([]);
  const [available, setAvailable] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selectedQuery, setSelectedQuery] = useState("");

  useEffect(() => {
    if (query.trim().length < 2 || query === selectedQuery) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/reference/cid?q=${encodeURIComponent(query)}&page=${page}`, { signal: controller.signal });
        const data = await response.json() as { items?: CidItem[]; available?: boolean; hasMore?: boolean };
        if (controller.signal.aborted) return;
        setAvailable(data.available !== false);
        setItems(data.items ?? []);
        setHasMore(data.hasMore ?? false);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setAvailable(false);
        setItems([]);
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, page, selectedQuery]);

  function choose(item: CidItem) {
    onSelect(item);
    const nextQuery = `${item.code} — ${item.description}`;
    setQuery(nextQuery);
    setSelectedQuery(nextQuery);
    setItems([]);
  }

  return <div className="relative grid gap-1">
    <label className="text-sm font-bold" htmlFor={id}>Consultar CID-10 (opcional)</label>
    <input id={id} className="field" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); setItems([]); }} onKeyDown={(event) => { if (event.key === "Enter" && items[0]) { event.preventDefault(); choose(items[0]); } }} placeholder="Digite o código ou a descrição do diagnóstico" autoComplete="off" />
    <p className="text-xs text-muted">Ao selecionar, o CID será incluído no texto. Informe-o somente com autorização do paciente.</p>
    {!available && <p className="text-xs font-bold text-amber-700">Tabela CID-10 indisponível. O preenchimento manual continua disponível.</p>}
    {items.length > 0 && <ul className="absolute top-full z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border bg-white p-1 shadow-xl">
      {items.map((item) => <li key={item.code}><button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" type="button" onClick={() => choose(item)}><strong>{item.code}</strong><span className="block text-xs text-muted">{item.description}</span></button></li>)}
      <li className="flex items-center justify-between gap-2 p-2"><button type="button" className="secondary-button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Anterior</button><span className="text-xs">Página {page}</span><button type="button" className="secondary-button" disabled={!hasMore} onClick={() => setPage(value => value + 1)}>Próxima</button></li>
    </ul>}
  </div>;
}
