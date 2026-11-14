import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import Link from "next/link";
import { z } from "zod";

import { adjustPosCash, closeCash, openCash } from "@/actions/financial-operations";
import { ActionForm } from "@/components/action-form";
import { ModalShell } from "@/components/modal-shell";
import { PageHeader } from "@/components/page-header";
import { PaginatedCollection } from "@/components/paginated-collection";
import { db } from "@/db";
import { cashClosings, cashMovements, financialAccounts, users } from "@/db/schema";
import { financeMonth, financeQuery, nextFinanceMonth, type FinanceSearchParams } from "@/lib/finance-navigation";
import { organizationDate, zonedDate } from "@/lib/organization-time";
import { hasOrganizationPermission } from "@/lib/permissions";
import { canOperatePosCash, getOpenPosCash, loadPosCashActivity, posCashBalance } from "@/lib/pos-cash";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Meus Caixas" };
const path = "/financeiro/meus-caixas";
const money = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const cashSelection = {
  id: cashClosings.id, accountId: cashClosings.accountId, account: financialAccounts.name, operator: users.name,
  ownerId: cashClosings.openedByUserId, opening: cashClosings.openingBalanceInCents, expected: cashClosings.expectedBalanceInCents,
  counted: cashClosings.countedBalanceInCents, difference: cashClosings.differenceInCents, openedAt: cashClosings.openedAt,
  closedAt: cashClosings.closedAt, notes: cashClosings.notes,
};

function cashRows() {
  return db.select(cashSelection).from(cashClosings)
    .leftJoin(financialAccounts, and(eq(financialAccounts.id, cashClosings.accountId), eq(financialAccounts.organizationId, cashClosings.organizationId)))
    .leftJoin(users, eq(users.id, cashClosings.openedByUserId));
}

type Cash = Awaited<ReturnType<typeof cashRows>>[number];
const cashName = (cash: Cash) => cash.account ? "Caixa por conta · " + cash.account : "Caixa " + cash.id.slice(0, 8);

export default async function CashClosingPage({ searchParams }: { searchParams: Promise<FinanceSearchParams> }) {
  const { session, organization } = await requireOrganization();
  const actor = session.user.id;
  const canOperate = canOperatePosCash(organization.role);
  const manageLegacy = hasOrganizationPermission(organization.role, "finance.manage");
  const manageAll = hasOrganizationPermission(organization.role, "cash.close");
  const readAll = hasOrganizationPermission(organization.role, "finance.read") || manageAll;
  if (!canOperate && !readAll) return <div className="page-wrap"><p className="panel">Acesso restrito ao caixa.</p></div>;

  const query = financeQuery(await searchParams);
  const month = query.get("mes") ? financeMonth(query.get("mes") ?? undefined, organizationDate(new Date(), organization.timezone)) : "";
  const operator = query.get("operador");
  const status = query.get("status");
  const selected = z.uuid().safeParse(query.get("caixa"));
  const date = (value: Date) => value.toLocaleString("pt-BR", { timeZone: organization.timezone });
  const scope = and(eq(cashClosings.organizationId, organization.id), readAll ? undefined :
    and(eq(cashClosings.openedByUserId, actor), isNull(cashClosings.accountId)));

  const [ownCash, history, operators] = await Promise.all([
    canOperate ? getOpenPosCash(db, organization.id, actor) : null,
    cashRows().where(and(scope,
      readAll && operator ? eq(cashClosings.openedByUserId, operator) : undefined,
      status === "aberto" ? isNull(cashClosings.closedAt) : status === "fechado" ? isNotNull(cashClosings.closedAt) : undefined,
      month ? gte(cashClosings.openedAt, zonedDate(month + "-01", "00:00", organization.timezone)) : undefined,
      month ? lt(cashClosings.openedAt, zonedDate(nextFinanceMonth(month) + "-01", "00:00", organization.timezone)) : undefined,
    )).orderBy(desc(cashClosings.openedAt)),
    readAll ? db.selectDistinct({ id: users.id, name: users.name }).from(cashClosings)
      .innerJoin(users, eq(users.id, cashClosings.openedByUserId)).where(scope).orderBy(asc(users.name)) : [],
  ]);
  const detailId = selected.success ? selected.data : ownCash?.id;
  const [detail] = detailId ? await cashRows().where(and(scope, eq(cashClosings.id, detailId))).limit(1) : [];

  return <div className="page-wrap grid gap-5">
    <PageHeader eyebrow="Financeiro" title="Meus Caixas" description="Abra seu caixa, consulte os movimentos e confira o dinheiro no fechamento." />
    <div className="flex flex-wrap gap-3">
      <Link className="secondary-button" href="/vendas">Ir para Venda e Orçamento</Link>
      {canOperate && !ownCash && <ModalShell title="Abrir caixa" variant="new" compact closeOnSuccess>
        <ActionForm action={openCash} successMessage="Caixa aberto." className="grid gap-4">
          <label className="grid gap-2 text-sm font-bold">Saldo inicial em dinheiro (R$)<input className="field" name="openingBalance" inputMode="decimal" placeholder="0,00" /></label>
          <button className="primary-button w-fit">Abrir caixa</button>
        </ActionForm>
      </ModalShell>}
      {ownCash && detailId !== ownCash.id && <Link className="primary-button" href={path + "?caixa=" + ownCash.id}>Ver meu caixa aberto</Link>}
    </div>
    {detail && <CashDetails cash={detail} organizationId={organization.id} date={date} canManage={detail.accountId ? manageLegacy : manageAll || (canOperate && detail.ownerId === actor)} />}
    {selected.success && !detail && <p className="empty-state">Caixa indisponível.</p>}

    <section className="panel">
      <h2 className="text-lg font-extrabold">Histórico de caixas</h2>
      <form method="get" className="mt-4 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-xs font-bold">Mês da abertura<input className="field" type="month" name="mes" defaultValue={month} /></label>
        {readAll && <label className="grid gap-1 text-xs font-bold">Operador<select className="field" name="operador" defaultValue={operator ?? ""}><option value="">Todos</option>{operators.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        <label className="grid gap-1 text-xs font-bold">Situação<select className="field" name="status" defaultValue={status ?? ""}><option value="">Todas</option><option value="aberto">Aberto</option><option value="fechado">Fechado</option></select></label>
        <div className="flex flex-wrap gap-2"><button className="primary-button">Filtrar</button><Link className="secondary-button" href={path}>Limpar</Link></div>
      </form>
      <PaginatedCollection key={query.toString()} label="Caixas" className="mt-4 divide-y">
        {history.map((cash) => <article className="flex flex-wrap items-center justify-between gap-2 py-4" key={cash.id}>
          <div>
            <div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{cashName(cash)}</h3><span className="status-pill">{cash.closedAt ? "Fechado" : "Aberto"}</span></div>
            <p className="mt-1 text-xs text-slate-600 leading-5 font-medium">{date(cash.openedAt)}{cash.closedAt && " · fechado em " + date(cash.closedAt)}{cash.operator && " · " + cash.operator}</p>
            {cash.closedAt && <p className="text-sm">Conferido {money(cash.counted ?? 0)} · diferença {money(cash.difference ?? 0)}</p>}
          </div>
          <Link className="secondary-button" href={path + "?" + new URLSearchParams([...query].filter(([key]) => key !== "caixa").concat([["caixa", cash.id]]))}>Ver resumo</Link>
        </article>)}
        {!history.length && <p className="empty-state">Nenhum caixa encontrado para os filtros.</p>}
      </PaginatedCollection>
    </section>
  </div>;
}

async function CashDetails({ cash, organizationId, date, canManage }: { cash: Cash; organizationId: string; date: (value: Date) => string; canManage: boolean }) {
  if (cash.accountId) {
    const [total] = !cash.closedAt ? await db.select({ amount: sql<number>`coalesce(sum(${cashMovements.amountInCents}), 0)`.mapWith(Number) })
      .from(cashMovements).where(and(eq(cashMovements.organizationId, organizationId), eq(cashMovements.accountId, cash.accountId),
        isNull(cashMovements.cashClosingId), gte(cashMovements.occurredAt, cash.openedAt))) : [];
    return <section className="panel grid gap-3">
      <h2 className="text-lg font-extrabold">{cashName(cash)}</h2>
      <p className="text-xs text-slate-600 leading-5 font-medium">Abertura em {date(cash.openedAt)} · {cash.operator}</p>
      <p className="font-bold">Saldo esperado {money(cash.expected ?? cash.opening + (total?.amount ?? 0))}</p>
      {cash.closedAt ? <ClosedSummary cash={cash} /> : canManage && <CloseForm cashId={cash.id} countedLabel="Saldo conferido (R$)" />}
    </section>;
  }

  const activity = await loadPosCashActivity(db, organizationId, cash.id);
  const totals = new Map<string, { name: string; sales: number; reversals: number }>();
  let afterClosing = 0;
  let lateCount = 0;
  for (const payment of activity.payments) {
    if (cash.closedAt && payment.occurredAt > cash.closedAt) {
      lateCount++;
      afterClosing += payment.amount;
      continue;
    }
    const name = payment.name || payment.method;
    const key = payment.methodId ?? name;
    const total = totals.get(key) ?? { name, sales: 0, reversals: 0 };
    if (payment.amount > 0) total.sales += payment.amount;
    else total.reversals -= payment.amount;
    totals.set(key, total);
  }
  const movements = [
    ...activity.payments.map(item => ({
      id: "p-" + item.id, at: item.occurredAt, label: item.amount < 0 ? "Estorno" : "Recebimento",
      description: item.name || item.method, amount: item.amount,
    })),
    ...activity.adjustments.map(item => ({
      id: item.id, at: item.createdAt, label: item.kind === "supply" ? "Suprimento" : "Sangria", description: item.reason,
      amount: item.kind === "supply" ? item.amountInCents : -item.amountInCents,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  const expected = cash.expected ?? posCashBalance(cash.opening, activity);

  return <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]" aria-label="Resumo do caixa">
    <div className="panel grid min-w-0 gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-extrabold">{cashName(cash)}</h2><span className="status-pill">{cash.closedAt ? "Fechado" : "Aberto"}</span></div>
        <p className="mt-1 text-xs text-slate-600 leading-5 font-medium">Abertura em {date(cash.openedAt)} · {cash.operator}</p>
      </div>
      <div>
        <h3 className="mb-2 font-extrabold">Pagamentos por forma</h3>
        {totals.size ? <dl className="divide-y">{[...totals].map(([key, total]) => <div className="flex flex-wrap justify-between gap-2 py-2" key={key}>
          <dt className="font-bold">{total.name}</dt><dd className="text-right"><strong>{money(total.sales - total.reversals)}</strong><p className="text-xs text-slate-600 leading-5 font-medium">Recebido {money(total.sales)} · estornado {money(total.reversals)}</p></dd>
        </div>)}</dl> : <p className="empty-state">Nenhum pagamento registrado.</p>}
        {lateCount > 0 && <p className="mt-2 text-xs text-slate-600 leading-5 font-medium">Movimentos após o fechamento ({lateCount}) · saldo líquido {money(afterClosing)}</p>}
      </div>
      <div>
        <h3 className="mb-2 font-extrabold">Movimentações</h3>
        <PaginatedCollection key={cash.id} label="Movimentações" className="divide-y">
          {movements.map(item => <article key={item.id} className="flex flex-wrap justify-between gap-2 py-2">
            <div className="min-w-0 break-words"><p className="font-bold">{item.label} · {item.description}</p><p className="text-xs text-slate-600 leading-5 font-medium">{date(item.at)}{cash.closedAt && item.at > cash.closedAt && " · após o fechamento"}</p></div>
            <p className={item.amount < 0 ? "font-bold text-red-700" : "font-bold text-emerald-700"}>{money(item.amount)}</p>
          </article>)}
          {!movements.length && <p className="empty-state">Nenhuma movimentação registrada.</p>}
        </PaginatedCollection>
      </div>
    </div>
    <aside className="panel grid gap-4" aria-label="Conferência do dinheiro">
      <h3 className="text-lg font-extrabold">Conferência do dinheiro</h3>
      <p className="text-sm">Saldo inicial {money(cash.opening)}</p>
      <p className="font-extrabold text-brand">Dinheiro esperado {money(expected)}</p>
      {cash.closedAt ? <ClosedSummary cash={cash} /> : canManage && <>
        <div className="flex flex-wrap gap-2">
          <AdjustmentForm cashId={cash.id} kind="supply" label="Suprimento" />
          <AdjustmentForm cashId={cash.id} kind="withdrawal" label="Sangria" />
        </div>
        <CloseForm cashId={cash.id} />
      </>}
    </aside>
  </section>;
}

function ClosedSummary({ cash }: { cash: Cash }) {
  return <div className="grid gap-2 text-sm">
    <p>Valor contado {money(cash.counted ?? 0)}</p>
    <p className={cash.difference ? "font-bold text-amber-800" : "font-bold text-brand"}>Diferença {money(cash.difference ?? 0)}</p>
    {cash.notes && <p className="break-words text-slate-600 text-xs leading-5 font-medium">{cash.notes}</p>}
  </div>;
}

function CloseForm({ cashId, countedLabel = "Dinheiro contado (R$)" }: { cashId: string; countedLabel?: string }) {
  return <ModalShell title="Fechar caixa" variant="edit" triggerLabel="Fechar caixa" secondary compact closeOnSuccess>
    <ActionForm action={closeCash} successMessage="Caixa fechado." className="grid gap-3">
      <input type="hidden" name="id" value={cashId} />
      <label className="grid gap-2 text-sm font-bold">{countedLabel}<input className="field" name="countedBalance" inputMode="decimal" required /></label>
      <label className="grid gap-2 text-sm font-bold">Observação<textarea className="field" name="notes" maxLength={2000} /></label>
      <button className="primary-button">Fechar e conferir</button>
    </ActionForm>
  </ModalShell>;
}

function AdjustmentForm({ cashId, kind, label }: { cashId: string; kind: "supply" | "withdrawal"; label: string }) {
  return <ModalShell title={label} variant="new" secondary compact closeOnSuccess>
    <ActionForm action={adjustPosCash} successMessage={label + " registrado."} className="grid gap-3">
      <input type="hidden" name="id" value={cashId} />
      <input type="hidden" name="adjustmentId" value={randomUUID()} />
      <input type="hidden" name="kind" value={kind} />
      <label className="grid gap-2 text-sm font-bold">Valor (R$)<input className="field" name="amount" inputMode="decimal" required /></label>
      <label className="grid gap-2 text-sm font-bold">Motivo<textarea className="field" name="reason" maxLength={500} required /></label>
      <button className="primary-button">Registrar {label.toLowerCase()}</button>
    </ActionForm>
  </ModalShell>;
}
