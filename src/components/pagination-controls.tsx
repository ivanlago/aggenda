"use client";

import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";
import { LIST_PAGE_SIZES } from "@/lib/list-pagination";

export function PaginationControls({ label, page, pageSize, total, onPage, onPageSize }: {
  label: string; page: number; pageSize: number; total?: number;
  onPage: (page: number) => void; onPageSize: (size: number) => void;
}) {
  const pages = total === undefined ? undefined : Math.max(1, Math.ceil(total / pageSize));
  const canGoNext = pages !== undefined && page < pages;
  const options = [...new Set([...LIST_PAGE_SIZES, pageSize])].sort((a, b) => a - b);
  return <nav aria-label={`Paginação: ${label}`} className="flex flex-wrap items-center gap-3 border-t pt-3 text-sm">
    <select className="field w-auto py-2" aria-label={`Linhas por página: ${label}`} value={pageSize} onChange={event => onPageSize(Number(event.target.value))}>
      {options.map(size => <option key={size} value={size}>{size} por página</option>)}
    </select>
    <div className="flex items-center gap-1">
      <button type="button" className="icon-button" disabled={page === 1} aria-label="Primeira página" onClick={() => onPage(1)}><ChevronFirst className="size-4" /></button>
      <button type="button" className="icon-button" disabled={page === 1} aria-label="Página anterior" onClick={() => onPage(page - 1)}><ChevronLeft className="size-4" /></button>
      <span className="px-2 font-bold" aria-live="polite" aria-label={pages ? `Página ${page} de ${pages}` : `Página ${page}`}>{page}{pages ? ` / ${pages}` : ""}</span>
      <button type="button" className="icon-button" disabled={!canGoNext} aria-label="Próxima página" onClick={() => onPage(page + 1)}><ChevronRight className="size-4" /></button>
      {pages !== undefined && <button type="button" className="icon-button" disabled={!canGoNext} aria-label="Última página" onClick={() => onPage(pages)}><ChevronLast className="size-4" /></button>}
    </div>
    {total !== undefined && <span className="text-muted" aria-live="polite">{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} de ${total}` : "Nenhum registro"}</span>}
  </nav>;
}
