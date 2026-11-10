import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import Link from "next/link";
import { PaginatedCollection } from "@/components/paginated-collection";
import { db } from "@/db";
import { cashMovements, financialAccounts } from "@/db/schema";
import { launchesPath } from "@/lib/finance-navigation";
import { zonedDate } from "@/lib/organization-time";

const money = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function FinancialStatement({ organizationId, timezone, month, nextMonth, selectedAccount }: {
  organizationId: string;
  timezone: string;
  month: string;
  nextMonth: string;
  selectedAccount?: string;
}) {
  const start = zonedDate(month + "-01", "00:00", timezone);
  const end = zonedDate(nextMonth + "-01", "00:00", timezone);
  const date = new Intl.DateTimeFormat("pt-BR", { timeZone: timezone });

  const { accounts, scopedAccounts, previous, movements } = await db.transaction(async (tx) => {
    const accounts = await tx.select().from(financialAccounts)
      .where(eq(financialAccounts.organizationId, organizationId))
      .orderBy(asc(financialAccounts.name));
    const account = accounts.find((item) => item.id === selectedAccount);
    const scopedAccounts = account ? [account] : accounts;
    const scope = and(eq(cashMovements.organizationId, organizationId), account ? eq(cashMovements.accountId, account.id) : undefined);
    const [previous] = await tx.select({ amount: sql<number>`coalesce(sum(${cashMovements.amountInCents}), 0)`.mapWith(Number) })
      .from(cashMovements).where(and(scope, lt(cashMovements.occurredAt, start)));
    const movements = await tx.select().from(cashMovements)
      .where(and(scope, gte(cashMovements.occurredAt, start), lt(cashMovements.occurredAt, end)))
      .orderBy(asc(cashMovements.occurredAt), asc(cashMovements.id));
    return { accounts, scopedAccounts, previous, movements };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });

  const accountNames = new Map(accounts.map((item) => [item.id, item.name]));
  const initialBalance = scopedAccounts.filter((item) => item.createdAt < start)
    .reduce((total, item) => total + item.openingBalanceInCents, previous.amount);
  const accountOpenings = scopedAccounts
    .filter((item) => item.createdAt >= start && item.createdAt < end && item.openingBalanceInCents !== 0)
    .map((item) => ({
      id: "abertura-" + item.id, accountId: item.id, occurredAt: item.createdAt, description: "Saldo inicial da conta",
      paymentMethodName: null, amountInCents: item.openingBalanceInCents,
    }));
  const ordered = [...accountOpenings, ...movements].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const rows: (typeof ordered[number] & { balance: number })[] = [];
  let balance = initialBalance;
  for (const item of ordered) {
    balance += item.amountInCents;
    rows.push({ ...item, balance });
  }

  return <>
    <form method="get" className="panel mb-5 grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
      <input type="hidden" name="aba" value="extrato" />
      <label className="grid gap-1 text-xs font-bold">Período<input className="field" type="month" name="mes" defaultValue={month} /></label>
      <label className="grid gap-1 text-xs font-bold">Conta<select className="field" name="conta" defaultValue={selectedAccount ?? "all"}><option value="all">Todas</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="flex flex-wrap gap-2"><button className="primary-button">Filtrar</button><Link className="secondary-button" href={launchesPath + "?aba=extrato"}>Limpar</Link></div>
    </form>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <section className="panel min-w-0">
        <h2 className="text-lg font-extrabold">Movimentações</h2>
        <p className="mt-1 text-sm text-muted">Entradas, saídas e estornos registrados nas contas de destino.</p>
        <PaginatedCollection key={month + ":" + selectedAccount} label="Movimentações" className="mt-4 divide-y">
          {rows.map((row) => <article key={row.id} className="grid gap-2 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
            <time dateTime={row.occurredAt.toISOString()} className="text-sm text-muted">{date.format(row.occurredAt)}</time>
            <div className="min-w-0 break-words"><p className="font-bold">{row.description}</p><p className="text-xs text-muted">{accountNames.get(row.accountId)}{row.paymentMethodName && " · " + row.paymentMethodName}</p></div>
            <div className="sm:text-right"><p className={row.amountInCents < 0 ? "font-bold text-red-700" : "font-bold text-emerald-700"}>{money(row.amountInCents)}</p><p className="text-xs text-muted">Saldo {money(row.balance)}</p></div>
          </article>)}
          {!rows.length && <p className="empty-state">Nenhuma movimentação encontrada no período.</p>}
        </PaginatedCollection>
      </section>
      <aside className="grid gap-3" aria-label="Saldos do extrato">
        <article className="panel"><p className="text-sm text-muted">Saldo anterior</p><p className="text-xl font-extrabold">{money(initialBalance)}</p></article>
        <article className="panel"><p className="text-sm text-muted">Saldo ao fim do período</p><p className="text-xl font-extrabold">{money(balance)}</p></article>
      </aside>
    </div>
  </>;
}
