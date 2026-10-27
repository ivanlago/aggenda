import Link from "next/link";
import { listPageHref } from "@/lib/list-pagination";

export function ListPagination({ path, query, page, total, pageSize = 20, parameter = "pagina" }: { path: string; query: Record<string, string | undefined>; page: number; total: number; pageSize?: number; parameter?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav aria-label="Paginação da lista" className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
    <p className="text-muted">{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} de ${total}` : "Nenhum registro"}</p>
    {pages > 1 && <div className="flex items-center gap-3">{page > 1 ? <Link className="secondary-button" href={listPageHref(path, query, page - 1, parameter)}>Anterior</Link> : <span className="secondary-button opacity-50" aria-disabled="true">Anterior</span>}<span>Página {page} de {pages}</span>{page < pages ? <Link className="secondary-button" href={listPageHref(path, query, page + 1, parameter)}>Próxima</Link> : <span className="secondary-button opacity-50" aria-disabled="true">Próxima</span>}</div>}
  </nav>;
}
