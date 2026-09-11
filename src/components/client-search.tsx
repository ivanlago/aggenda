"use client";

import { useId, useState } from "react";
import { Search, X } from "lucide-react";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function ClientSearch({ clients, value, onChange, fixed = false, required = false }: {
  clients: { id: string; name: string }[]; value: string; onChange: (id: string) => void; fixed?: boolean; required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const id = useId();
  const selected = clients.find((client) => client.id === value);
  const matches = clients.filter((client) => normalize(client.name).includes(normalize(query)));
  return <div className="relative grid gap-2">
    <input type="hidden" name="clientId" value={value} />
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-bold">{fixed ? "Cliente" : "Cliente (opcional)"}</span>
      {!fixed && <button type="button" className="icon-button" aria-label="Buscar cliente" aria-expanded={open} aria-controls={id} onClick={() => setOpen((current) => !current)}><Search className="size-4" /></button>}
      {open && <input autoFocus className="field w-[17ch] max-w-full" aria-label="Nome do cliente" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); if (event.key === "Enter") { event.preventDefault(); if (matches.length === 1) { onChange(matches[0].id); setOpen(false); setQuery(""); } } }} />}
    </div>
    {open && <div id={id} className="max-h-48 overflow-y-auto rounded-xl border bg-white p-1" aria-label="Resultados da busca de clientes">
      {matches.slice(0, 50).map((client) => <button key={client.id} type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-brand/10 focus:bg-brand/10" onClick={() => { onChange(client.id); setOpen(false); setQuery(""); }}>{client.name}</button>)}
      {!matches.length && <p className="p-2 text-sm text-muted">Nenhum cliente encontrado.</p>}
      {matches.length > 50 && <p className="p-2 text-xs text-muted">Digite mais letras para refinar a busca.</p>}
    </div>}
    {value && <div className="flex items-center gap-2 text-sm"><span>{selected?.name ?? "Cliente selecionado"}</span>{!fixed && <button type="button" className="icon-button" aria-label="Remover cliente selecionado" onClick={() => onChange("")}><X className="size-4" /></button>}</div>}
    {required && !value && <p className="text-xs text-amber-700">Selecione um cliente para vender procedimentos ou pacotes.</p>}
  </div>;
}
