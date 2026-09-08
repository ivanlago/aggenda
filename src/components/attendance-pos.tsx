import { getPosOfferings } from "@/lib/pos-catalog";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { clients, services, financialEntries, packageUsages, retailProductVariants, retailProducts, inventoryProducts, retailSales } from "@/db/schema";
import { requireAttendance } from "@/lib/attendance";
import { hasOrganizationPermission } from "@/lib/permissions";
import { formatOrganizationDateTime } from "@/lib/appointment-safety";
import { RetailSaleForm } from "@/components/retail-sale-form";
import { attendancePaymentState } from "@/lib/attendance-payment";

const currency = (amount: number) => (amount / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function AttendancePos({ appointmentId }: { appointmentId: string }) {
  const { appointment, organization } = await requireAttendance(appointmentId);
  const canPay = hasOrganizationPermission(organization.role, "finance.manage");
  const canSell = organization.role === "professional" || canPay || hasOrganizationPermission(organization.role, "sales.sell") || hasOrganizationPermission(organization.role, "inventory.manage");
  const canReadFinance = canSell || hasOrganizationPermission(organization.role, "finance.read");
  if (!canSell && !canReadFinance) return <section id="pdv" className="panel mt-5"><h2 className="text-xl font-extrabold">Pagto/Venda</h2><p className="mt-2 text-sm text-muted">Seu perfil não possui acesso a vendas ou pagamentos.</p></section>;
  const [[client], [service], paymentRows, usages, variantRows, sales, extras] = await Promise.all([
    db.select({ id: clients.id, name: clients.name, email: clients.email, phone: clients.phone }).from(clients).where(and(eq(clients.id, appointment.clientId), eq(clients.organizationId, organization.id))).limit(1),
    db.select({ name: services.name, price: services.priceInCents }).from(services).where(and(eq(services.id, appointment.serviceId), eq(services.organizationId, organization.id))).limit(1),
    canReadFinance ? db.select().from(financialEntries).where(and(eq(financialEntries.appointmentId, appointment.id), eq(financialEntries.organizationId, organization.id))).limit(1) : Promise.resolve([]),
    canReadFinance ? db.select().from(packageUsages).where(and(eq(packageUsages.appointmentId, appointment.id), eq(packageUsages.organizationId, organization.id), inArray(packageUsages.status, ["reserved", "consumed"]))) : Promise.resolve([]),
    canSell ? db.select({ id: retailProductVariants.id, product: retailProducts.name, variant: retailProductVariants.name, barcode: retailProductVariants.barcode, priceInCents: retailProductVariants.salePriceInCents, stock: inventoryProducts.currentQuantityMillis }).from(retailProductVariants).innerJoin(retailProducts, eq(retailProducts.id, retailProductVariants.productId)).innerJoin(inventoryProducts, eq(inventoryProducts.id, retailProductVariants.inventoryProductId)).where(and(eq(retailProductVariants.organizationId, organization.id), eq(retailProductVariants.isForSale, true), eq(retailProductVariants.isActive, true), eq(retailProducts.isActive, true), eq(inventoryProducts.isActive, true))).orderBy(asc(retailProducts.name)) : Promise.resolve([]),
    db.select({ id: retailSales.id, total: retailSales.totalInCents, status: retailSales.status, receiptToken: retailSales.receiptToken, soldAt: retailSales.soldAt, paymentStatus: financialEntries.status }).from(retailSales).leftJoin(financialEntries, eq(financialEntries.id, retailSales.financialEntryId)).where(and(eq(retailSales.organizationId, organization.id), eq(retailSales.attendanceId, appointment.id))).orderBy(desc(retailSales.soldAt)),
    canReadFinance ? db.select().from(financialEntries).where(and(eq(financialEntries.organizationId, organization.id), eq(financialEntries.attendanceId, appointment.id), eq(financialEntries.source, "attendance_extra"))).orderBy(desc(financialEntries.createdAt)) : Promise.resolve([]),
  ]);
  const catalog = canSell ? (await getPosOfferings(organization.id)).filter((item) => item.id !== `service:${appointment.serviceId}`) : [];
  const payment = paymentRows[0];
  const paymentState = attendancePaymentState({ paymentStatus: payment?.status, packageStatus: usages[0]?.status, appointmentStatus: appointment.status });
  const paid = paymentState === "paid";
  const covered = paymentState === "package";
  const amount = payment?.amountInCents ?? appointment.priceInCents ?? service.price ?? 0;
  const initialCart = paymentState === "pending" ? [{ variantId: `appointment:${appointment.id}`, quantity: 1, discountInCents: 0 }] : [];
  const offerings = [...catalog, ...(paymentState === "pending" ? [{ id: `appointment:${appointment.id}`, label: `${service.name} · Procedimento realizado`, barcode: null, priceInCents: amount, stock: 1, kind: "service" as const }] : [])];
  const variants = variantRows.map((variant) => ({ id: variant.id, label: `${variant.product} · ${variant.variant}`, barcode: variant.barcode, priceInCents: variant.priceInCents, stock: Math.floor(variant.stock / 1000) })).filter((variant) => variant.stock > 0);
  return <section id="pdv" className="mt-5 scroll-mt-6"><h2 className="mb-3 text-xl font-extrabold">Pagto/Venda</h2>
    {paid && <p className="mb-4 rounded-xl bg-emerald-50 p-3 font-bold text-emerald-800">Procedimento já pago. Inclua outros itens, se necessário.</p>}
    {covered && <p className="mb-4 rounded-xl bg-emerald-50 p-3 font-bold text-emerald-800">Procedimento coberto por pacote. Inclua outros itens, se necessário.</p>}
    {paymentState === "blocked" && <p className="mb-4 text-sm text-muted">Revise a situação do atendimento antes de cobrar o procedimento.</p>}
    {canSell && <RetailSaleForm key={paymentState} offerings={offerings} attendanceId={appointment.id} initialClientId={client.id} initialCart={initialCart} clients={[client]} variants={variants} canDiscount={hasOrganizationPermission(organization.role, "sales.discount")} />}
    <section className="panel mt-4"><h3 className="font-extrabold">Vendas e adicionais deste atendimento</h3>
      {sales.map((sale) => <div key={sale.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3"><div><p className="font-bold">Venda · {currency(sale.total)}</p><p className="text-xs text-muted">{formatOrganizationDateTime(sale.soldAt, organization.timezone)} · {sale.status !== "completed" ? "Cancelada / estornada" : sale.paymentStatus === "received" ? "Pagamento recebido" : "Pagamento pendente"}</p></div><Link className="secondary-button" href={`/recibo/${sale.receiptToken}`} target="_blank">Abrir recibo</Link></div>)}
      {extras.map((extra) => <div key={extra.id} className="mt-3 border-t pt-3"><p className="font-bold">{extra.description} · {currency(extra.amountInCents)}</p><p className="text-xs text-muted">{formatOrganizationDateTime(extra.createdAt, organization.timezone)} · {extra.status === "received" ? "Pagamento recebido" : extra.status}</p></div>)}
      {!sales.length && !extras.length && <p className="mt-3 text-sm text-muted">Nenhuma venda ou adicional registrado neste atendimento.</p>}
    </section>
  </section>;
}
