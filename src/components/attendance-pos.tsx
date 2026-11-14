import { AttendancePackages } from "@/components/attendance-packages";
import { ChargeCreateDialog, type ChargeProvider } from "@/components/charge-create-form";
import { onlineInstallmentRules } from "@/lib/payment-catalog-policy";
import { managedChargeStatuses } from "@/lib/finance-view";
import { getOpenPosCash } from "@/lib/pos-cash";
import { activePaymentMethods } from "@/lib/payment-methods";
import { PaginatedCollection } from "@/components/paginated-collection";
import { saleCommissionBeneficiaries } from "@/lib/commission-beneficiaries";
import { attendancePendingItems } from "@/lib/attendance-pending-items";
import { getPosOfferings, getPosProducts } from "@/lib/pos-catalog";
import { getPosPackageBalances } from "@/lib/pos-package-balances";
import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { clients, services, financialEntries, packageUsages, retailSales, paymentCharges, organizationFinancialIntegrations } from "@/db/schema";
import { requireAttendance } from "@/lib/attendance";
import { hasOrganizationPermission } from "@/lib/permissions";
import { formatOrganizationDateTime } from "@/lib/appointment-safety";
import { RetailSaleForm } from "@/components/retail-sale-form";
import { attendanceCheckoutSummary, shouldPrefillAttendanceCart } from "@/lib/attendance-payment";
import { SalesWorkspace } from "@/components/sales-workspace";
import { AttendanceQuote } from "@/components/attendance-quote";

const currency = (amount: number) => (amount / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function AttendancePos({ appointmentId }: { appointmentId: string }) {
  const { appointment, organization, session } = await requireAttendance(appointmentId);
  const canPay = hasOrganizationPermission(organization.role, "finance.manage");
  const [saleCommission, customPaymentMethods] = await Promise.all([saleCommissionBeneficiaries(db, organization.id, session.user.id), activePaymentMethods(organization.id)]);
  const canSell = organization.role === "professional" || canPay || hasOrganizationPermission(organization.role, "sales.sell") || hasOrganizationPermission(organization.role, "inventory.manage");
  const canReadFinance = canSell || hasOrganizationPermission(organization.role, "finance.read");
  if (!canSell && !canReadFinance) return <section id="pdv" className="panel mt-5"><p className="text-sm text-muted">Seu perfil não possui acesso a vendas ou pagamentos.</p></section>;
  const [[client], [service], paymentRows, usages, variantRows, sales, extras] = await Promise.all([
    db.select({ id: clients.id, name: clients.name, email: clients.email, phone: clients.phone }).from(clients).where(and(eq(clients.id, appointment.clientId), eq(clients.organizationId, organization.id))).limit(1),
    db.select({ name: services.name, imageUrl: services.imageUrl, price: services.priceInCents }).from(services).where(and(eq(services.id, appointment.serviceId), eq(services.organizationId, organization.id))).limit(1),
    canReadFinance ? db.select().from(financialEntries).where(and(eq(financialEntries.appointmentId, appointment.id), eq(financialEntries.organizationId, organization.id))).limit(1) : Promise.resolve([]),
    canReadFinance ? db.select().from(packageUsages).where(and(eq(packageUsages.appointmentId, appointment.id), eq(packageUsages.organizationId, organization.id), inArray(packageUsages.status, ["reserved", "consumed"]))) : Promise.resolve([]),
    canSell ? getPosProducts(organization.id) : Promise.resolve([]),
    db.select({ id: retailSales.id, total: retailSales.totalInCents, status: retailSales.status, receiptToken: retailSales.receiptToken, soldAt: retailSales.soldAt, paymentStatus: financialEntries.status }).from(retailSales).leftJoin(financialEntries, eq(financialEntries.id, retailSales.financialEntryId)).where(and(eq(retailSales.organizationId, organization.id), eq(retailSales.attendanceId, appointment.id))).orderBy(desc(retailSales.soldAt)),
    canReadFinance ? db.select().from(financialEntries).where(and(eq(financialEntries.organizationId, organization.id), eq(financialEntries.attendanceId, appointment.id), eq(financialEntries.source, "attendance_extra"))).orderBy(desc(financialEntries.createdAt)) : Promise.resolve([]),
  ]);
  const [allOfferings, packageBalances, cashSession] = await Promise.all([
    canSell ? getPosOfferings(organization.id) : Promise.resolve([]),
    getPosPackageBalances(organization.id, appointment.clientId),
    canSell ? getOpenPosCash(db, organization.id, session.user.id) : Promise.resolve(null),
  ]);
  const catalog = allOfferings.filter((item) => appointment.metadata?.primaryProcedureRemoved === true || item.id !== `service:${appointment.serviceId}`);
  const payment = paymentRows[0];
  const charges = payment ? await db.select({id: paymentCharges.id, status: paymentCharges.status}).from(paymentCharges).where(and(eq(paymentCharges.organizationId, organization.id), eq(paymentCharges.financialEntryId, payment.id), inArray(paymentCharges.status, managedChargeStatuses))) : [];
  const integrations = canPay ? await db.select({provider: organizationFinancialIntegrations.provider, isDefault: organizationFinancialIntegrations.isDefaultPos}).from(organizationFinancialIntegrations).where(and(eq(organizationFinancialIntegrations.organizationId, organization.id), eq(organizationFinancialIntegrations.status, "active"))) : [];
  const providers = integrations.map(row => row.provider).filter((provider): provider is ChargeProvider => ["asaas", "mercado_pago", "pagbank", "efi"].includes(provider));
  const {state: paymentState, balance: amount, awaitingDeposit, canReceiveService} = attendanceCheckoutSummary({paymentStatus:payment?.status,packageStatus:usages[0]?.status,appointmentStatus:appointment.status,serviceAmount:appointment.priceInCents??service.price??0,entryAmount:payment?.amountInCents,depositAmount:appointment.depositAmountInCents,depositStatus:appointment.depositStatus,managedCharge:charges.length>0});
  const prefillProcedure = canReceiveService && appointment.metadata?.primaryProcedureRemoved !== true && shouldPrefillAttendanceCart(paymentState, appointment.serviceId, packageBalances);
  const initialCart = prefillProcedure ? [{ variantId: `appointment:${appointment.id}`, quantity: 1, discountInCents: 0 }] : [];
  const offerings = [...catalog, ...(canReceiveService && appointment.metadata?.primaryProcedureRemoved !== true ? [{ id: `appointment:${appointment.id}`, label: `${service.name} · Serviço realizado`, imageUrl: service.imageUrl, barcode: null, priceInCents: amount, stock: 1, kind: "service" as const }] : [])];
  const variants = variantRows;
  const pending = attendancePendingItems(appointment.metadata);
  for (const item of pending) {
    if (![...offerings, ...variants].some((entry) => entry.id === item.catalogId)) continue;
    const existing = initialCart.find((entry) => entry.variantId === item.catalogId);
    if (existing) existing.quantity += item.quantity;
    else initialCart.push({ variantId: item.catalogId, quantity: item.quantity, discountInCents: 0 });
  }
  return <section id="pdv" className="mt-5 scroll-mt-6">
    {paymentState === "blocked" && <p className="mb-4 text-sm text-muted">Revise a situação do atendimento antes de cobrar o serviço.</p>}
    <section className="panel mb-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold">Recebimento do atendimento</h2><p className="text-sm font-medium">{client.name} · {service.name}</p></div><div className="text-right"><p className="text-xs text-slate-500">{paymentState === "paid" ? "Saldo quitado" : paymentState === "package" ? "Coberto por pacote" : "Saldo do serviço"}</p><p className="text-xl font-extrabold text-brand">{currency(paymentState === "paid" || paymentState === "package" ? 0 : amount)}</p></div></div>
      {appointment.depositAmountInCents > 0 && <p className="mt-2 text-xs leading-5 text-slate-600">Sinal: {currency(appointment.depositAmountInCents)} · {appointment.depositStatus === "paid" ? "recebido, descontado do saldo" : "aguardando confirmação"}</p>}
      {awaitingDeposit && <p className="mt-2 text-sm text-amber-800">Confirme primeiro o sinal antes de receber o saldo do serviço.</p>}
      {charges.length > 0 && paymentState !== "paid" && <p className="mt-2 text-sm text-amber-800">Este serviço possui cobrança online vinculada. Aguarde a confirmação do provedor ou gerencie a cobrança antes de receber por outro meio.</p>}
      <div className="mt-3 flex flex-wrap gap-2">{charges.map(charge => <Link key={charge.id} className="secondary-button" href={`/financeiro/lancamentos?aba=receber&visao=cobrancas&cobranca=${charge.id}#cobranca-${charge.id}`}>Acompanhar cobrança online</Link>)}
      {canPay && !awaitingDeposit && paymentState === "pending" && payment?.status === "pending" && !charges.length && providers.length > 0 && <ChargeCreateDialog triggerLabel="Emitir cobrança online do serviço" openForInitialEntry={false} initialEntryId={payment.id} providers={providers} defaultProvider={providers.find(provider => integrations.some(row => row.provider === provider && row.isDefault))} onlineInstallmentPolicy={organization.onlineInstallmentPolicy ? onlineInstallmentRules(organization.onlineInstallmentPolicy) : undefined} canOverridePagBank={hasOrganizationPermission(organization.role,"integrations.manage")} entries={[{id:payment.id,description:payment.description,amount:currency(payment.amountInCents),amountInCents:payment.amountInCents,dueDate:payment.dueDate,clientName:client.name,clientEmail:client.email??"",clientPhone:client.phone??""}]} />}
      </div><p className="mt-2 text-xs leading-5 text-slate-500">Use o PDV abaixo para registrar valores já recebidos, dividir pagamentos e receber os itens do carrinho. Cobranças online permanecem pendentes até a confirmação do provedor.</p>
    </section>
    {packageBalances.some(balance => balance.serviceId === appointment.serviceId && !balance.expired && (balance.remaining > 0 || (balance.reserved ?? 0) > 0)) && <AttendancePackages appointmentId={appointmentId} />}
    {canSell && <SalesWorkspace sale={<RetailSaleForm cashSession={cashSession} operatorName={session.user.name} customPaymentMethods={customPaymentMethods} commissionChoices={saleCommission.choices} defaultCommissionBeneficiary={saleCommission.defaultBeneficiary} key={`${appointment.id}:${paymentState}:${prefillProcedure}:${pending.map((item) => item.id).join(",")}`} offerings={offerings} attendanceId={appointment.id} initialClientId={client.id} initialCart={initialCart} pendingAttendanceItems={pending} clients={[client]} variants={variants} timezone={organization.timezone} packageBalances={packageBalances} canDiscount={hasOrganizationPermission(organization.role, "sales.discount")} />} quote={<AttendanceQuote appointmentId={appointmentId} />} />}
    <section className="panel mt-4"><h3 className="font-extrabold">Vendas e adicionais deste atendimento</h3>
      <PaginatedCollection label="Registros" className="mt-4">{sales.map((sale) => <div key={sale.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3"><div><p className="font-bold">Venda · {currency(sale.total)}</p><p className="text-xs text-muted">{formatOrganizationDateTime(sale.soldAt, organization.timezone)} · {sale.status !== "completed" ? "Cancelada / estornada" : sale.paymentStatus === "received" ? "Pagamento recebido" : "Pagamento pendente"}</p></div><Link className="secondary-button" href={`/recibo/${sale.receiptToken}`} target="_blank">Abrir recibo</Link></div>)}</PaginatedCollection>
      <PaginatedCollection label="Registros" className="mt-4">{extras.map((extra) => <div key={extra.id} className="mt-3 border-t pt-3"><p className="font-bold">{extra.description} · {currency(extra.amountInCents)}</p><p className="text-xs text-muted">{formatOrganizationDateTime(extra.createdAt, organization.timezone)} · {extra.status === "received" ? "Pagamento recebido" : extra.status}</p></div>)}</PaginatedCollection>
      {!sales.length && !extras.length && <p className="mt-3 text-sm text-muted">Nenhuma venda ou adicional registrado neste atendimento.</p>}
    </section>
  </section>;
}


