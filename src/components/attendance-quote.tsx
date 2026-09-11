import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { retailQuotes } from "@/db/schema";
import { requireAttendance } from "@/lib/attendance";
import { getPosOfferings, getPosProducts } from "@/lib/pos-catalog";
import { hasOrganizationPermission } from "@/lib/permissions";
import { organizationDate } from "@/lib/appointment-safety";
import { RetailQuoteForm } from "@/components/retail-quote-form";

export async function AttendanceQuote({ appointmentId }: { appointmentId: string }) {
  const { appointment, organization } = await requireAttendance(appointmentId);
  const [products, offerings, quotes] = await Promise.all([
    getPosProducts(organization.id), getPosOfferings(organization.id),
    db.select().from(retailQuotes).where(and(eq(retailQuotes.organizationId, organization.id), eq(retailQuotes.attendanceId, appointmentId))).orderBy(desc(retailQuotes.createdAt)),
  ]);
  return <div className="grid gap-4">
    <RetailQuoteForm catalog={[...products, ...offerings]} clients={[]} attendanceId={appointmentId} initialClientId={appointment.clientId} canDiscount={hasOrganizationPermission(organization.role, "sales.discount")} defaultValidity={organizationDate(new Date(new Date().getTime() + 30 * 86400000), organization.timezone)} />
    {quotes.length > 0 && <div className="rounded-xl border p-4"><h3 className="font-bold">Orçamentos deste atendimento</h3>{quotes.map((quote) => <div key={quote.id} className="mt-3 flex flex-wrap items-center gap-3"><span className="text-sm">#{quote.id.slice(0, 8)} · {quote.saleId ? "Convertido em venda" : "Salvo"}</span><Link className="secondary-button" href={`/api/quotes/${quote.id}/pdf`} target="_blank">Abrir PDF</Link><Link className="secondary-button" href={`/vendas?quote=${quote.id}#orcamentos`}>Recuperar orçamento</Link></div>)}</div>}
  </div>;
}
