import { and, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import Link from "next/link";
import { ListPagination } from "@/components/list-pagination";
import { parseListPageSize } from "@/lib/list-pagination";
import { db } from "@/db";
import { appointments, retailQuotes, retailSales } from "@/db/schema";
import { requireOrganization, requireProfessionalScope } from "@/lib/session";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireRetailQuote, canManageQuotes } from "@/lib/retail-quotes";
import { formatOrganizationDateTime, organizationDate, organizationDayRange } from "@/lib/appointment-safety";

const money = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function RetailQuoteLibrary({ selectedId, search = "", page = 1, size, showAll = false }: { selectedId?: string; search?: string; page?: number; size?: string; showAll?: boolean }) {
  const { organization, session } = await requireOrganization();
  const professionalId = organization.role === "professional" ? await requireProfessionalScope(organization.id, session.user.id) : null;
  if (!professionalId && !canManageQuotes(organization.role) && !hasOrganizationPermission(organization.role, "inventory.read") && !hasOrganizationPermission(organization.role, "documents.read")) return null;
  const selected = selectedId ? (await requireRetailQuote(selectedId)).quote : null;
  const pageNumber = Math.max(1, Math.min(100000, Math.trunc(page) || 1));
  const pageSize = parseListPageSize(size);
  const query = search.trim().slice(0, 100);
  const dayRange = organizationDayRange(new Date(), organization.timezone);
  const rows = await db.select({ quote: retailQuotes, receiptToken: retailSales.receiptToken, total: sql<number>`count(*) over ()`.mapWith(Number) }).from(retailQuotes).leftJoin(retailSales, eq(retailSales.id, retailQuotes.saleId))
    .where(and(eq(retailQuotes.organizationId, organization.id), !showAll ? and(gte(retailQuotes.createdAt, dayRange.start), lt(retailQuotes.createdAt, dayRange.end)) : undefined, professionalId ? inArray(retailQuotes.attendanceId, db.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.organizationId, organization.id), eq(appointments.professionalId, professionalId)))) : undefined, query ? or(ilike(retailQuotes.clientName, `%${query}%`), sql`${retailQuotes.id}::text ilike ${`%${query}%`}`) : undefined)).orderBy(desc(retailQuotes.createdAt), desc(retailQuotes.id)).limit(pageSize).offset((pageNumber - 1) * pageSize);
  const today = organizationDate(new Date(), organization.timezone);
  return <section id="orcamentos" className="panel mt-5 scroll-mt-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-extrabold">Orçamentos {showAll ? "salvos" : "de hoje"}</h2><Link className="secondary-button" href={`/vendas?history=${showAll ? "today" : "all"}#orcamentos`}>{showAll ? "Mostrar somente hoje" : "Ver anteriores"}</Link></div>
    <form className="my-4 flex flex-wrap gap-2" action="/vendas"><input type="hidden" name="secao" value="orcamentos" /><input type="hidden" name="linhasOrcamentos" value={pageSize} /><input type="hidden" name="history" value={showAll ? "all" : "today"} /><input className="field flex-1" name="search" defaultValue={query} placeholder="Buscar por cliente ou número do orçamento" aria-label="Buscar orçamentos" /><button className="secondary-button">Buscar</button></form>
    {selected && <article className="mb-5 rounded-xl border border-brand/30 bg-brand/5 p-4">
      <h3 className="font-extrabold">Orçamento #{selected.id.slice(0, 8)}</h3>
      <p className="mt-1 text-sm">{selected.clientName || "Cliente não identificado"} · Válido até {selected.validUntil.split("-").reverse().join("/")}</p>
      <ul className="my-3 space-y-2">{selected.items.map((item) => <li key={item.variantId} className="text-sm">{item.quantity} × {item.label} · {money(item.unitPriceInCents * item.quantity - item.discountInCents)}</li>)}</ul>
      {selected.notes && <p className="mb-3 whitespace-pre-wrap text-sm">{selected.notes}</p>}
      <p className="font-extrabold">Total: {money(selected.totalInCents)}</p>
      <div className="mt-3 flex flex-wrap gap-2"><Link className="secondary-button" href={`/api/quotes/${selected.id}/pdf`} target="_blank">Abrir PDF</Link>{!selected.saleId && selected.validUntil >= today && canManageQuotes(organization.role) && <Link className="primary-button" href={`/vendas?convert=${selected.id}#venda-form`}>Converter em venda</Link>}</div>
      {(selected.saleId || selected.validUntil < today) && <p className="mt-2 text-sm font-bold">{selected.saleId ? "Já convertido em venda" : "Orçamento vencido"}</p>}
    </article>}
    <div className="divide-y">{rows.map(({ quote, receiptToken }) => <article key={quote.id} className="grid min-w-0 items-center gap-3 py-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div><p className="font-extrabold">#{quote.id.slice(0, 8)} · {quote.clientName || "Cliente não identificado"}</p><p className="text-xs text-slate-600 leading-5 font-medium">{formatOrganizationDateTime(quote.createdAt, organization.timezone)} · {quote.saleId ? "Convertido em venda" : quote.validUntil < today ? "Vencido" : "Disponível"}</p></div><p className="font-bold tabular-nums text-brand">{money(quote.totalInCents)}</p>
      <div className="flex flex-wrap gap-2"><Link className="secondary-button" href={`/vendas?quote=${quote.id}#orcamentos`}>Recuperar</Link><Link className="secondary-button" href={`/api/quotes/${quote.id}/pdf`} target="_blank">PDF</Link>{receiptToken ? <Link className="secondary-button" href={`/recibo/${receiptToken}`} target="_blank">Ver venda</Link> : quote.validUntil >= today && canManageQuotes(organization.role) ? <Link className="primary-button" href={`/vendas?convert=${quote.id}#venda-form`}>Converter em venda</Link> : null}</div>
    </article>)}{!rows.length && <p className="py-5 text-xs text-slate-500 leading-5">Nenhum orçamento encontrado.</p>}</div>
    <div className="mt-3"><ListPagination path="/vendas" query={{ search: query, history: showAll ? "all" : "today", quote: selectedId, secao: "orcamentos" }} parameter="page" sizeParameter="linhasOrcamentos" page={pageNumber} pageSize={pageSize} total={rows[0]?.total ?? (pageNumber === 1 ? 0 : undefined)} label="Orçamentos" /></div>
  </section>;
}
