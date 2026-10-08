"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Result = { label: string; href: string; category: string };
export function AppSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [status, setStatus] = useState("Digite para buscar no Aggenda.");
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); input.current?.focus(); setOpen(true);
      }
    };
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("keydown", shortcut);
    document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", shortcut); document.removeEventListener("pointerdown", outside); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("search");
        const payload = await response.json();
        if (!controller.signal.aborted) { setResults(payload.results); setStatus(payload.results.length ? "" : "Nenhum resultado encontrado."); }
      } catch { if (!controller.signal.aborted) setStatus("Não foi possível buscar. Tente novamente."); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open]);
  return <div ref={container} className="relative w-full min-w-0 flex-1 sm:min-w-56 sm:max-w-xl">
    <Image src="/header/search.svg" width={15} height={15} alt="" unoptimized className="pointer-events-none absolute left-[18.5px] top-[14.5px]" />
    <input ref={input} type="search" role="combobox" aria-label="Buscar no Aggenda" aria-autocomplete="list" aria-expanded={open} aria-controls="aggenda-search-results" aria-activedescendant={active >= 0 ? `aggenda-search-${active}` : undefined} value={query} placeholder="Buscar no Aggenda... [Ctrl+K]" autoComplete="off" className="h-11 w-full rounded-lg border border-transparent bg-white pl-11 pr-4 text-sm text-foreground shadow-[0_1px_3px_rgba(15,23,42,0.03)] outline-none placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15" onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setResults([]); setStatus("Buscando..."); setActive(-1); setOpen(true); }} onKeyDown={event => {
      if (event.key === "Escape") { setOpen(false); setActive(-1); }
      if (event.key === "ArrowDown") { event.preventDefault(); setActive(current => Math.min(current + 1, results.length - 1)); setOpen(true); }
      if (event.key === "ArrowUp") { event.preventDefault(); setActive(current => Math.max(current - 1, 0)); }
      if (event.key === "Enter" && results.length) { event.preventDefault(); router.push(results[Math.max(active, 0)].href); setOpen(false); input.current?.blur(); }
    }} />
    {open && <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== input.current) setOpen(false); }}>
      <ul id="aggenda-search-results" role="listbox" aria-label="Resultados da busca">{results.map((result, index) => <li key={result.href} id={`aggenda-search-${index}`} role="option" aria-selected={active === index}><Link href={result.href} onClick={() => { setOpen(false); setQuery(""); }} className={`block rounded-lg px-3 py-2 text-sm hover:bg-surface-soft ${active === index ? "bg-surface-soft" : ""}`}><span className="block font-semibold">{result.label}</span><span className="text-xs text-muted">{result.category}</span></Link></li>)}</ul>
      <p role="status" className="px-3 text-xs text-muted">{status}</p>
    </div>}
  </div>;
}
