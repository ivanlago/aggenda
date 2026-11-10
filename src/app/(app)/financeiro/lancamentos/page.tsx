import { and, asc, desc, eq } from "drizzle-orm";
import { Download, Trash2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { deleteFinancialEntry, updateFinancialEntryStatus } from "@/actions/app";
import { ActionForm } from "@/components/action-form";
import { FinancialEntryControls } from "@/components/financial-entry-form";
import { PageHeader } from "@/components/page-header";
import { PaginatedCollection } from "@/components/paginated-collection";
import { PaymentMethodFields } from "@/components/payment-catalog-context";
import { db } from "@/db";
import { financialAccounts, financialCategories, financialCostCenters, financialEntries, paymentCharges, paymentMethods, retailSales } from "@/db/schema";
import { organizationDate } from "@/lib/appointment-safety";
import { financeMonth, financeQuery, launchesPath, launchesUrl, nextFinanceMonth, onlineChargesPath, type FinanceSearchParams } from "@/lib/finance-navigation";
import { financePeriod, isManagedCharge, matchesFinanceFilters } from "@/lib/finance-view";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";
import { FinancialStatement } from "./financial-statement";
import OnlineCharges from "./online-charges";

export const metadata = { title: "Lançamentos" };

const money = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const sourceLabels: Record<string, string> = {
  commission_payment: "Quitação de comissões",
  manual: "Manual",
  appointment: "Agendamento",
  package: "Pacote",
  installment: "Parcelado",
  recurring: "Recorrente",
  retail_sale: "Venda no PDV",
};
const tabs = [
  { id: "receber", label: "Contas a receber" },
  { id: "pagar", label: "Contas a pagar" },
  { id: "extrato", label: "Extrato" },
] as const;

export default async function LaunchesPage({ searchParams }: { searchParams: Promise<FinanceSearchParams> }) {
  const { organization } = await requireOrganization();
  if (!hasOrganizationPermission(organization.role, "finance.read")) redirect("/dashboard");

  const params = financeQuery(await searchParams);
  const query = Object.fromEntries(params);
  const tab = tabs.find(({ id }) => id === query.aba)?.id ?? "receber";
  const today = organizationDate(new Date(), organization.timezone);
  const month = financeMonth(query.mes, today);
  const nextMonth = nextFinanceMonth(month);
  const onlineCharges = tab === "receber" && query.visao === "cobrancas";

  return <div className="page-wrap">
    <PageHeader eyebrow="Financeiro" title="Lançamentos" description="Acompanhe contas a receber, contas a pagar e movimentações por conta." />
    <nav className="app-tabs" aria-label="Lançamentos financeiros">
      {tabs.map(({ id, label }) => {
        const destination = new URLSearchParams({ aba: id, mes: month });
        if (query.conta && query.conta !== "all") destination.set("conta", query.conta);
        return <Link key={id} className="app-tab" aria-current={tab === id ? "page" : undefined} href={launchesUrl(destination)}>{label}</Link>;
      })}
    </nav>
    <div className="app-tab-content">
      {tab === "extrato"
        ? <FinancialStatement organizationId={organization.id} timezone={organization.timezone} month={month} nextMonth={nextMonth} selectedAccount={query.conta} />
        : onlineCharges
          ? <OnlineCharges searchParams={Promise.resolve(query)} />
          : <AccountsView organization={organization} query={query} today={today} month={month} nextMonth={nextMonth} tab={tab} />}
    </div>
  </div>;
}

async function AccountsView({ organization, query, today, month, nextMonth, tab }: {
  organization: Awaited<ReturnType<typeof requireOrganization>>["organization"];
  query: Record<string, string | undefined>;
  today: string;
  month: string;
  nextMonth: string;
  tab: "receber" | "pagar";
}) {
  const incoming = tab === "receber";
  const type = incoming ? "receivable" : "payable";
  const canManage = hasOrganizationPermission(organization.role, "finance.manage");
  const [allEntries, accounts, categories, costCenters, charges, sales, methods] = await Promise.all([
    db.select().from(financialEntries).where(and(eq(financialEntries.organizationId, organization.id), eq(financialEntries.type, type))).orderBy(asc(financialEntries.dueDate)),
    db.select().from(financialAccounts).where(eq(financialAccounts.organizationId, organization.id)).orderBy(asc(financialAccounts.name)),
    db.select().from(financialCategories).where(eq(financialCategories.organizationId, organization.id)).orderBy(asc(financialCategories.name)),
    db.select().from(financialCostCenters).where(eq(financialCostCenters.organizationId, organization.id)).orderBy(asc(financialCostCenters.name)),
    db.select().from(paymentCharges).where(eq(paymentCharges.organizationId, organization.id)).orderBy(desc(paymentCharges.createdAt)),
    db.select({ id: retailSales.id, financialEntryId: retailSales.financialEntryId, appointmentFinancialEntryId: retailSales.appointmentFinancialEntryId }).from(retailSales).where(eq(retailSales.organizationId, organization.id)),
    db.select({ id: paymentMethods.id, name: paymentMethods.name }).from(paymentMethods).where(eq(paymentMethods.organizationId, organization.id)),
  ]);
  const filters = { ...query, tipo: type };
  const { entries, received, paid, receivable, payable, overdue } = financePeriod(allEntries, filters, today, month + "-01", nextMonth + "-01");
  const realized = incoming ? received : paid;
  const pending = incoming ? receivable : payable;
  const overdueTotal = overdue.reduce((total, entry) => total + entry.amountInCents, 0);
  const realizedStatus = incoming ? "received" : "paid";
  const realizedLabel = incoming ? "Recebidas" : "Pagas";
  const projections = [30, 60, 90].map((days) => {
    const end = new Date(today + "T12:00:00Z");
    end.setUTCDate(end.getUTCDate() + days);
    const until = end.toISOString().slice(0, 10);
    const amount = allEntries.filter((entry) => entry.status === "pending" && entry.dueDate >= today && entry.dueDate <= until && matchesFinanceFilters(entry, filters, today))
      .reduce((total, entry) => total + entry.amountInCents, 0);
    return { days, amount };
  });
  const totals = [
    { label: realizedLabel, amount: realized, color: "text-emerald-700" },
    { label: incoming ? "A receber" : "A pagar", amount: pending },
    { label: "Vencidas", amount: overdueTotal, color: "text-red-700" },
    { label: "Total do período", amount: realized + pending },
  ];
  const paymentNames = new Map(methods.map((method) => [method.id, method.name]));
  const chargesPath = onlineChargesPath + "&mes=" + month + (query.conta && query.conta !== "all" ? "&conta=" + encodeURIComponent(query.conta) : "");

  return <>
    <form method="get" className="panel mb-5 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <input type="hidden" name="aba" value={tab} />
      <label className="grid gap-1 text-xs font-bold">Período<input className="field" type="month" name="mes" defaultValue={month} /></label>
      <label className="grid gap-1 text-xs font-bold">Conta<select className="field" name="conta" defaultValue={query.conta ?? "all"}><option value="all">Todas</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-bold">Categoria<select className="field" name="categoria" defaultValue={query.categoria ?? "all"}><option value="all">Todas</option>{categories.filter((item) => item.type === type).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-bold">Situação<select className="field" name="status" defaultValue={query.status ?? "all"}><option value="all">Todas</option><option value="pending">Pendentes</option><option value="overdue">Vencidas</option><option value={realizedStatus}>{realizedLabel}</option><option value="cancelled">Canceladas</option></select></label>
      <label className="grid gap-1 text-xs font-bold">Vencimento no dia<input className="field" type="date" name="dia" defaultValue={query.dia ?? ""} /></label>
      <div className="flex flex-wrap gap-2"><button className="primary-button">Filtrar</button><Link className="secondary-button" href={launchesPath + "?aba=" + tab}>Limpar</Link></div>
    </form>
    <div className="mb-5 flex flex-wrap items-start gap-3">
      {canManage && <FinancialEntryControls key={type} categories={categories} costCenters={costCenters} today={today} initialType={type} autoOpen={query.novo === type} />}
      {incoming && <Link className="secondary-button" href={chargesPath}>{canManage ? "Emitir ou consultar cobrança online" : "Consultar cobranças online"}</Link>}
      <a className="secondary-button" href={"/api/finance/report?mes=" + month}><Download className="mr-2 size-4" />Relatório mensal PDF</a>
    </div>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <section className="panel min-w-0" aria-label={incoming ? "Contas a receber do período" : "Contas a pagar do período"}>
        <h2 className="text-lg font-extrabold">{incoming ? "Contas a receber" : "Contas a pagar"}</h2>
        <p className="mt-1 text-sm text-muted">Contas com vencimento ou baixa no período.</p>
      <PaginatedCollection key={JSON.stringify(query)} label="Registros" className="mt-4 divide-y">{[...entries].sort((a, b) => Number(b.id === query.lancamento) - Number(a.id === query.lancamento)).map((entry) => {
        const account = accounts.find((item) => item.id === entry.accountId)?.name;
        const costCenter = costCenters.find((item) => item.id === entry.costCenterId)?.name;
        const linkedCharges = charges.filter((item) => item.financialEntryId === entry.id);
        const charge = linkedCharges.find((item) => isManagedCharge(item.status)) ?? linkedCharges[0];
        const managed = linkedCharges.some((item) => isManagedCharge(item.status));
        const sale = sales.find((item) => item.financialEntryId === entry.id || item.appointmentFinancialEntryId === entry.id);
        const paymentName = entry.paymentMethodName || (entry.paymentMethodId ? paymentNames.get(entry.paymentMethodId) : null);
        const isOverdue = entry.status === "pending" && entry.dueDate < today;
        const isRealized = entry.status === "paid" || entry.status === "received";
        return <article id={`lancamento-${entry.id}`} key={entry.id} className={`grid scroll-mt-6 gap-3 py-4 xl:grid-cols-[1fr_auto] xl:items-center ${query.lancamento === entry.id ? "rounded-xl bg-teal-50 p-4" : ""}`}>
          <div><div className="flex flex-wrap items-center gap-2"><p className="font-extrabold">{entry.description}</p>{isOverdue && <span className="status-pill text-red-700">Vencido</span>}{managed && <span className="status-pill">Cobrança online vinculada</span>}</div>
            <p className="mt-1 text-xs text-muted">{entry.category || "Sem categoria"}{account ? ` · ${account}` : ""}{costCenter ? ` · ${costCenter}` : ""} · {sourceLabels[entry.source] ?? entry.source}{paymentName ? ` · ${paymentName}` : ""} · vencimento {new Date(`${entry.dueDate}T12:00:00Z`).toLocaleDateString("pt-BR")}{entry.realizedDate ? ` · baixa ${new Date(`${entry.realizedDate}T12:00:00Z`).toLocaleDateString("pt-BR")}` : ""}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {charge && <Link className="secondary-button" href={`${chargesPath}&cobranca=${charge.id}#cobranca-${charge.id}`}>Ver cobrança vinculada</Link>}
              {canManage && entry.type === "receivable" && entry.status === "pending" && !managed && entry.source !== "retail_sale" && !sale && <Link className="secondary-button" href={`${chargesPath}&lancamento=${entry.id}#nova-cobranca`}>Gerar cobrança</Link>}
              {sale && <Link className="secondary-button" href={`/vendas/pagamento/${sale.id}`}>Gerenciar no PDV</Link>}
              {canManage && entry.source === "commission_payment" && <Link className="secondary-button" href="/financeiro/comissoes">Gerenciar quitação</Link>}
            </div>
            {(managed || sale || entry.source === "retail_sale") && <p className="mt-2 text-xs text-muted">{sale || entry.source === "retail_sale" ? "Gerencie o recebimento pela venda no PDV." : "A baixa desta conta é controlada pela confirmação do provedor. Para alterações, consulte a cobrança vinculada."}</p>}
          </div>
          <div className="xl:text-right"><p className={`font-extrabold ${entry.type === "receivable" ? "text-emerald-700" : "text-red-700"}`}>{entry.type === "receivable" ? "+" : "−"} {money(entry.amountInCents)}</p><span className="status-pill">{entry.status === "pending" ? "Pendente" : entry.status === "cancelled" ? "Cancelado" : entry.type === "payable" ? "Pago" : "Recebido"}</span></div>
          {canManage && entry.source !== "commission_payment" && entry.source !== "retail_sale" && !sale && !managed && <details className="xl:col-span-2"><summary className="cursor-pointer text-sm font-bold text-brand">Registrar ou corrigir {entry.type === "payable" ? "pagamento" : "recebimento"} manual</summary>
            <div className="mt-3 flex flex-wrap items-end gap-3"><ActionForm action={updateFinancialEntryStatus} successMessage="Lançamento atualizado." className="flex flex-wrap items-end gap-3"><input type="hidden" name="id" value={entry.id} />
              <label className="grid gap-1 text-sm font-bold">Situação<select className="field" name="status" defaultValue={isRealized ? "realized" : entry.status}><option value="pending">Pendente</option><option value="realized">{entry.type === "payable" ? "Pago" : "Recebido"}</option><option value="cancelled">Cancelado</option></select></label>
              <PaymentMethodFields required={false} initialMethodId={entry.paymentMethodId ?? ""} initialAccountId={entry.accountId ?? ""} /><label className="grid gap-1 text-sm font-bold">Data da baixa<input className="field" name="realizedDate" type="date" defaultValue={entry.realizedDate ?? today} /></label><button className="secondary-button">Salvar baixa manual</button>
            </ActionForm>{["manual", "installment", "recurring"].includes(entry.source) && <ActionForm action={deleteFinancialEntry} successMessage="Lançamento excluído."><input type="hidden" name="id" value={entry.id} /><button className="icon-button" aria-label={`Excluir lançamento: ${entry.description}`}><Trash2 className="size-4" /></button></ActionForm>}</div>
          </details>}
        </article>;
      })}{!entries.length && <p className="empty-state">Nenhum lançamento encontrado para os filtros.</p>}</PaginatedCollection>
      </section>
      <aside className="grid gap-3" aria-label="Totais do período">
        {totals.map(({ label, amount, color }) => <article key={label} className="panel"><p className="text-sm text-muted">{label}</p><p className={"text-xl font-extrabold " + (color ?? "")}>{money(amount)}</p></article>)}
        <p className="text-xs text-muted">Os valores baixados seguem a data da baixa. As pendências seguem o vencimento e incluem as contas vencidas.</p>
      </aside>
    </div>
    <details className="panel mt-5">
      <summary className="cursor-pointer font-bold">Previsão dos próximos 90 dias</summary>
      <dl className="mt-3 grid gap-3 sm:grid-cols-3">{projections.map(({ days, amount }) => <div key={days}><dt className="text-sm text-muted">Próximos {days} dias</dt><dd className="font-extrabold">{money(amount)}</dd></div>)}</dl>
    </details>
  </>;
}
