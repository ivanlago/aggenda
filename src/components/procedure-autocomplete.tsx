"use client";

import { useMemo, useState } from "react";

export type RegisteredProcedure = { id: string; name: string; shortName: string | null; tussCode: string | null; preparation: string | null };

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function ProcedureAutocomplete({ procedures, onSelect, onCustom, resetAfterSelect = false, label = "Buscar procedimento cadastrado" }: { procedures: RegisteredProcedure[]; onSelect: (procedure: RegisteredProcedure) => void; onCustom?: (name: string) => void; resetAfterSelect?: boolean; label?: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    const needle = normalize(query.trim());
    if (needle.length < 2) return [];
    return procedures.filter((item) => normalize(`${item.shortName ?? ""} ${item.name} ${item.tussCode ?? ""}`).includes(needle)).slice(0, 30);
  }, [procedures, query]);
  function choose(item: RegisteredProcedure) { onSelect(item); setQuery(resetAfterSelect ? "" : `${item.shortName || item.name}${item.tussCode ? ` · TUSS ${item.tussCode}` : ""}`); setOpen(false); }
  return <div className="relative grid gap-1"><label className="text-sm font-bold">{label}</label><input className="field" value={query} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onFocus={() => { if (query.trim().length >= 2) setOpen(true); }} onKeyDown={(event) => { if (event.key !== "Enter" || query.trim().length < 2) return; event.preventDefault(); if (results[0]) choose(results[0]); else if (onCustom) { onCustom(query.trim()); setQuery(""); setOpen(false); } }} placeholder="Nome, nome curto ou código TUSS" autoComplete="off" />{open && results.length ? <ul className="absolute top-full z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border bg-white p-1 shadow-xl">{results.map((item) => <li key={item.id}><button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" type="button" onClick={() => choose(item)}><strong>{item.shortName || item.name}</strong>{item.shortName ? <span className="block text-xs text-muted">{item.name}</span> : null}{item.tussCode ? <span className="block text-xs text-muted">TUSS {item.tussCode}</span> : null}</button></li>)}</ul> : null}{onCustom ? <p className="text-xs text-muted">Selecione uma sugestão. Se não encontrar, digite o nome completo e pressione Enter.</p> : null}</div>;
}
