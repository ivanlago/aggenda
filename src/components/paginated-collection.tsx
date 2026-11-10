"use client";

import { Children, isValidElement, useRef, useState, type ReactNode } from "react";
import { PaginationControls } from "./pagination-controls";

/** Bounds rendered records without truncating the collection or changing totals/exports. */
export function PaginatedCollection({ children, className, as = "div", label = "Registros", pageSize: initialPageSize = 10, tableColumns = 100 }: { children: ReactNode; className?: string; as?: "div" | "tbody" | "ul"; label?: string; pageSize?: number; tableColumns?: number }) {
  const viewport = useRef<HTMLElement | null>(null);
  const records = Children.toArray(children);
  const onlyChild = records[0];
  const empty = !records.length || (records.length === 1 && isValidElement<{ className?: string }>(onlyChild)
    && onlyChild.props.className?.split(" ").includes("empty-state"));
  const signature = records.map((record, index) => isValidElement(record) ? record.key ?? index : index).join("|");
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [position, setPosition] = useState({ signature, page: 1 });
  const pages = Math.max(1, Math.ceil(records.length / pageSize));
  const page = position.signature === signature ? Math.min(position.page, pages) : 1;
  const changePage = (next: number) => { setPosition({ signature, page: Math.max(1, Math.min(next, pages)) }); if (viewport.current) viewport.current.scrollTop = 0; };
  const visible = records.slice((page - 1) * pageSize, page * pageSize);
  const controls = !empty ? <PaginationControls label={label} page={page} pageSize={pageSize} total={records.length} onPage={changePage} onPageSize={size => { setPageSize(size); changePage(1); }} /> : null;
  if (as === "tbody") return <tbody ref={element => { viewport.current = element?.closest("table")?.parentElement ?? null; }} className={className}>{visible}{controls && <tr><td colSpan={tableColumns} className="py-3">{controls}</td></tr>}</tbody>;
  const Tag = as;
  return <div className="min-w-0"><Tag ref={(element: HTMLElement | null) => { viewport.current = element; }} className={`${className ?? ""} max-h-[40rem] overflow-y-auto overscroll-contain`} role="region" aria-label={label} tabIndex={0}>{visible}</Tag>{controls && <div className="mt-3">{controls}</div>}</div>;
}

