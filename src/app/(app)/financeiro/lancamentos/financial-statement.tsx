import Link from "next/link";
import { PaginatedCollection } from "@/components/paginated-collection";
import { db } from "@/db";
import { launchesPath } from "@/lib/finance-navigation";
import { loadFinancialStatement } from "@/lib/financial-statement";
import { FinancialDownloadButtons } from "./financial-download-buttons";

const money = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function FinancialStatement({ organizationId, timezone, month, nextMonth, selectedAccount }: {
  organizationId: string;
  timezone: string;
  month: string;
  nextMonth: string;
  selectedAccount?: string;
}) {
  const { accounts, accountNames, initialBalance, balance, rows } = await loadFinancialStatement(db, { organizationId, timezone, month, nextMonth, selectedAccount });
  const date = new Intl.DateTimeFormat("pt-BR", { timeZone: timezone });

  return <>
    <form method="get" className="panel mb-5 grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
      <input type="hidden" name="aba" value="extrato" />
      <label className="grid gap-1 text-xs font-bold">Período<input className="field" type="month" name="mes" defaultValue={month} /></label>
      <label className="grid gap-1 text-xs font-bold">Conta<select className="field" name="conta" defaultValue={selectedAccount ?? "all"}><option value="all">Todas</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="flex flex-wrap gap-2"><button className="primary-button">Filtrar</button><Link className="secondary-button" href={launchesPath + "?aba=extrato"}>Limpar</Link></div>
    </form>
    <FinancialDownloadButtons filters={{ aba: "extrato", mes: month, conta: selectedAccount }} />
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
