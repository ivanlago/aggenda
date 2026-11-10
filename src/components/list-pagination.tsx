"use client";

import { useRouter } from "next/navigation";
import { listPageHref } from "@/lib/list-pagination";
import { PaginationControls } from "./pagination-controls";

export function ListPagination({ path, query, page, total, pageSize = 20, parameter = "pagina", sizeParameter = "linhas", label = "Registros" }: {
  path: string; query: Record<string, string | undefined>; page: number; total?: number;
  pageSize?: number; parameter?: string; sizeParameter?: string; label?: string;
}) {
  const router = useRouter();
  function go(next: number, size: number) {
    router.push(listPageHref(path, { ...query, [sizeParameter]: String(size) }, next, parameter), { scroll: false });
  }
  return <PaginationControls label={label} page={page} pageSize={pageSize} total={total} onPage={next => go(next, pageSize)} onPageSize={size => go(1, size)} />;
}
