"use client";

import { Children, isValidElement, useRef, useState, type ReactNode } from "react";

/** Bounds rendered records without truncating the collection or changing totals/exports. */
export function PaginatedCollection({ children, className, as = "div", label = "Registros", pageSize: initialPageSize = 10 }: { children: ReactNode; className?: string; as?: "div" | "tbody" | "ul"; label?: string; pageSize?: number }) {
  const viewport = useRef<HTMLElement | null>(null);
  const records = Children.toArray(children);
  const signature = records.map((record, index) => isValidElement(record) ? record.key ?? index : index).join("|");
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [position, setPosition] = useState({ signature, page: 1 });
  const pages = Math.max(1, Math.ceil(records.length / pageSize));
  const page = position.signature === signature ? Math.min(position.page, pages) : 1;
  const changePage = (next: number) => { setPosition({ signature, page: Math.max(1, Math.min(next, pages)) }); if (viewport.current) viewport.current.scrollTop = 0; };
  const visible = records.slice((page - 1) * pageSize, page * pageSize);
  const controls = records.length > initialPageSize ? <nav aria-label={`Paginação: ${label}`} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm">
    <span className="text-muted" aria-live="polite">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, records.length)} de {records.length}</span>
    <label className="flex items-center gap-2">Por página<select className="field w-auto py-1" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); changePage(1); }}>{[10, 20, 50].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
    <div className="flex items-center gap-2"><button type="button" className="secondary-button" disabled={page === 1} onClick={() => changePage(page - 1)}>Anterior</button><span>Página {page} de {pages}</span><button type="button" className="secondary-button" disabled={page === pages} onClick={() => changePage(page + 1)}>Próxima</button></div>
  </nav> : null;
  if (as === "tbody") return <tbody ref={element => { viewport.current = element?.closest("table")?.parentElement ?? null; }} className={className}>{visible}{controls && <tr><td colSpan={100} className="py-3">{controls}</td></tr>}</tbody>;
  const Tag = as;
  return <div className="min-w-0"><Tag ref={(element: HTMLElement | null) => { viewport.current = element; }} className={`${className ?? ""} max-h-[40rem] overflow-y-auto overscroll-contain`} role="region" aria-label={label} tabIndex={0}>{visible}</Tag>{controls && <div className="mt-3">{controls}</div>}</div>;
}

