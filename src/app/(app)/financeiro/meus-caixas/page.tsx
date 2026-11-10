import { and, asc, desc, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import Link from "next/link";
import { closeCash, openCash } from "@/actions/financial-operations";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { PaginatedCollection } from "@/components/paginated-collection";
import { db } from "@/db";
import { cashClosings, cashMovements, financialAccounts, users } from "@/db/schema";
import { financeMonth, financeQuery, launchesPath, nextFinanceMonth, type FinanceSearchParams } from "@/lib/finance-navigation";
import { organizationDate, zonedDate } from "@/lib/organization-time";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Meus Caixas" };
const money = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function CashClosingPage({ searchParams }: { searchParams: Promise<FinanceSearchParams> }) {
  const { organization } = await requireOrganization();
  if (!hasOrganizationPermission(organization.role, "finance.read")) return <div className="page-wrap"><p className="panel">Acesso restrito ao financeiro.</p></div>;
  const canManage = hasOrganizationPermission(organization.role, "finance.manage");
  const date = (value: Date) => value.toLocaleString("pt-BR", { timeZone: organization.timezone });
  const query = financeQuery(await searchParams);
  const today = organizationDate(new Date(), organization.timezone);
  const month = query.get("mes") ? financeMonth(query.get("mes") ?? undefined, today) : "";
  const accountId = query.get("conta");
  const operatorId = query.get("operador");
  const status = query.get("status");
  const [accounts, openCashList, historyAccounts, operators] = await Promise.all([
    db.select({ id: financialAccounts.id, name: financialAccounts.name }).from(financialAccounts).where(and(eq(financialAccounts.organizationId, organization.id), eq(financialAccounts.isActive, true))).orderBy(asc(financialAccounts.name)),
    db.select({ id: cashClosings.id, accountId: cashClosings.accountId, account: financialAccounts.name, opening: cashClosings.openingBalanceInCents, openedAt: cashClosings.openedAt }).from(cashClosings).innerJoin(financialAccounts, eq(financialAccounts.id, cashClosings.accountId)).where(and(eq(cashClosings.organizationId, organization.id), isNull(cashClosings.closedAt))),
    db.select({ id: financialAccounts.id, name: financialAccounts.name }).from(financialAccounts).where(eq(financialAccounts.organizationId, organization.id)).orderBy(asc(financialAccounts.name)),
    db.selectDistinct({ id: users.id, name: users.name }).from(cashClosings).innerJoin(users, eq(users.id, cashClosings.openedByUserId)).where(eq(cashClosings.organizationId, organization.id)).orderBy(asc(users.name)),
  ]);
  const filteredAccount = historyAccounts.find((account) => account.id === accountId);
  const history = await db.select({
    id: cashClosings.id, account: financialAccounts.name, operator: users.name, opening: cashClosings.openingBalanceInCents,
    expected: cashClosings.expectedBalanceInCents, counted: cashClosings.countedBalanceInCents, difference: cashClosings.differenceInCents,
    openedAt: cashClosings.openedAt, closedAt: cashClosings.closedAt, notes: cashClosings.notes,
  }).from(cashClosings)
    .innerJoin(financialAccounts, eq(financialAccounts.id, cashClosings.accountId))
    .leftJoin(users, eq(users.id, cashClosings.openedByUserId))
    .where(and(
      eq(cashClosings.organizationId, organization.id),
      filteredAccount ? eq(cashClosings.accountId, filteredAccount.id) : undefined,
      operatorId ? eq(cashClosings.openedByUserId, operatorId) : undefined,
      status === "aberto" ? isNull(cashClosings.closedAt) : status === "fechado" ? isNotNull(cashClosings.closedAt) : undefined,
      month ? gte(cashClosings.openedAt, zonedDate(month + "-01", "00:00", organization.timezone)) : undefined,
      month ? lt(cashClosings.openedAt, zonedDate(nextFinanceMonth(month) + "-01", "00:00", organization.timezone)) : undefined,
    )).orderBy(desc(cashClosings.openedAt));
  const availableAccounts = accounts.filter((account) => !openCashList.some((cash) => cash.accountId === account.id));
  const summaries = await Promise.all(openCashList.map(cash => db.select({ name: cashMovements.paymentMethodName, amount: sql<number>`coalesce(sum(${cashMovements.amountInCents}),0)`.mapWith(Number) }).from(cashMovements).where(and(eq(cashMovements.organizationId, organization.id), eq(cashMovements.accountId, cash.accountId), isNull(cashMovements.cashClosingId), gte(cashMovements.occurredAt, cash.openedAt))).groupBy(cashMovements.paymentMethodName)));

  return <div className="page-wrap grid gap-5">
    <Link className="inline-flex text-sm font-bold text-brand" href={launchesPath}>← Lançamentos</Link>
    <PageHeader eyebrow="Financeiro" title="Meus Caixas" description="Abra, confira e acompanhe o histórico de cada caixa." />
    <p className="text-sm text-muted">Saldo esperado = abertura + entradas − saídas. Pagamentos divididos entram em seus respectivos destinos. O fechamento registra o saldo conferido; não movimenta dinheiro entre contas.</p>
    {!accounts.length && <p className="panel text-sm text-amber-900">Cadastre uma conta ou caixa ativo. <Link className="font-bold underline" href="/financeiro/cadastros">Cadastrar conta</Link></p>}
    <section className="grid gap-5 lg:grid-cols-2">
      {canManage && <ActionForm action={openCash} successMessage="Caixa aberto." className="panel grid content-start gap-3"><h2 className="text-lg font-extrabold">Abrir novo caixa</h2><label className="grid gap-2 text-sm font-bold">Conta / caixa<select className="field" name="accountId" required><option value="">Selecione</option>{availableAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label className="grid gap-2 text-sm font-bold">Saldo contado na abertura<input className="field" name="openingBalance" inputMode="decimal" required /></label><button className="primary-button" disabled={!availableAccounts.length}>Abrir caixa</button></ActionForm>}
      <article className="panel"><h2 className="text-lg font-extrabold">Caixas abertos</h2><div className="mt-4 grid gap-4">{openCashList.map((cash, index) => <div className="rounded-xl border p-4" key={cash.id}>
        <h3 className="font-extrabold">{cash.account}</h3><p className="text-sm text-muted">Aberto em {date(cash.openedAt)} · abertura {money(cash.opening)}</p>
        <ul className="my-3 grid gap-1 text-sm">{summaries[index].map((group, position) => <li className="flex justify-between gap-3" key={position}><span>{group.name || "Histórico sem identificação da forma"}</span><strong>{money(group.amount)}</strong></li>)}</ul>
        <p className="font-bold text-brand">Saldo esperado agora: {money(cash.opening + summaries[index].reduce((sum, item) => sum + item.amount, 0))}</p>
        {canManage && <ActionForm action={closeCash} successMessage="Caixa fechado e conferido." className="mt-4 grid gap-3"><input type="hidden" name="id" value={cash.id} /><label className="grid gap-2 text-sm font-bold">Saldo contado no fechamento<input className="field" name="countedBalance" inputMode="decimal" required /></label><label className="grid gap-2 text-sm font-bold">Observação<input className="field" name="notes" maxLength={2000} /></label><button className="secondary-button">Fechar e conferir</button></ActionForm>}
      </div>)}{!openCashList.length && <p className="empty-state">Nenhum caixa aberto.</p>}</div></article>
    </section>
    <section className="panel">
      <h2 className="text-lg font-extrabold">Histórico de caixas</h2>
      <form method="get" className="mt-4 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="grid gap-1 text-xs font-bold">Mês da abertura<input className="field" type="month" name="mes" defaultValue={month} /></label>
        <label className="grid gap-1 text-xs font-bold">Caixa<select className="field" name="conta" defaultValue={accountId ?? ""}><option value="">Todos</option>{historyAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-bold">Operador da abertura<select className="field" name="operador" defaultValue={operatorId ?? ""}><option value="">Todos</option>{operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.name}</option>)}</select></label>
        <label className="grid gap-1 text-xs font-bold">Situação<select className="field" name="status" defaultValue={status ?? ""}><option value="">Todas</option><option value="aberto">Aberto</option><option value="fechado">Fechado</option></select></label>
        <div className="flex flex-wrap gap-2"><button className="primary-button">Filtrar</button><Link className="secondary-button" href="/financeiro/meus-caixas">Limpar</Link></div>
      </form>
      <PaginatedCollection key={query.toString()} label="Caixas" className="mt-4 divide-y">
        {history.map((cash) => <article className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start" key={cash.id}>
          <div>
            <div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{cash.account}</h3><span className="status-pill">{cash.closedAt ? "Fechado" : "Aberto"}</span></div>
            <p className="mt-1 text-sm text-muted">Abertura {date(cash.openedAt)}{cash.closedAt && " · fechamento " + date(cash.closedAt)}{cash.operator && " · " + cash.operator}</p>
            {cash.notes && <p className="mt-2 text-sm text-muted">{cash.notes}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-sm font-bold">{cash.closedAt ? "Conferido " + money(cash.counted ?? 0) : "Saldo de abertura " + money(cash.opening)}</p>
            {cash.closedAt && <p className="text-xs text-muted">Esperado {money(cash.expected ?? 0)} · diferença {money(cash.difference ?? 0)}</p>}
          </div>
        </article>)}
        {!history.length && <p className="empty-state">Nenhum caixa encontrado para os filtros.</p>}
      </PaginatedCollection>
    </section>
  </div>;
}
