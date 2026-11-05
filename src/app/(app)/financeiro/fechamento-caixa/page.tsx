import { and, asc, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { closeCash, openCash } from "@/actions/financial-operations";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { cashClosings, cashMovements, financialAccounts } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Fechamento de caixa" };
const money = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function CashClosingPage() {
  const { organization } = await requireOrganization();
  if (!hasOrganizationPermission(organization.role, "finance.read")) return <div className="page-wrap"><p className="panel">Acesso restrito ao financeiro.</p></div>;
  const canManage = hasOrganizationPermission(organization.role, "finance.manage");
  const date = (value: Date) => value.toLocaleString("pt-BR", { timeZone: organization.timezone });
  const [accounts, openCashList, history] = await Promise.all([
    db.select({ id: financialAccounts.id, name: financialAccounts.name }).from(financialAccounts).where(and(eq(financialAccounts.organizationId, organization.id), eq(financialAccounts.isActive, true))).orderBy(asc(financialAccounts.name)),
    db.select({ id: cashClosings.id, accountId: cashClosings.accountId, account: financialAccounts.name, opening: cashClosings.openingBalanceInCents, openedAt: cashClosings.openedAt }).from(cashClosings).innerJoin(financialAccounts, eq(financialAccounts.id, cashClosings.accountId)).where(and(eq(cashClosings.organizationId, organization.id), isNull(cashClosings.closedAt))),
    db.select({ id: cashClosings.id, account: financialAccounts.name, opening: cashClosings.openingBalanceInCents, expected: cashClosings.expectedBalanceInCents, counted: cashClosings.countedBalanceInCents, difference: cashClosings.differenceInCents, openedAt: cashClosings.openedAt, closedAt: cashClosings.closedAt, notes: cashClosings.notes }).from(cashClosings).innerJoin(financialAccounts, eq(financialAccounts.id, cashClosings.accountId)).where(and(eq(cashClosings.organizationId, organization.id), isNotNull(cashClosings.closedAt))).orderBy(desc(cashClosings.closedAt)).limit(20),
  ]);
  const summaries = await Promise.all(openCashList.map(cash => db.select({ name: cashMovements.paymentMethodName, amount: sql<number>`coalesce(sum(${cashMovements.amountInCents}),0)`.mapWith(Number) }).from(cashMovements).where(and(eq(cashMovements.organizationId, organization.id), eq(cashMovements.accountId, cash.accountId), isNull(cashMovements.cashClosingId), gte(cashMovements.occurredAt, cash.openedAt))).groupBy(cashMovements.paymentMethodName)));

  return <div className="page-wrap grid gap-5">
    <Link className="inline-flex text-sm font-bold text-brand" href="/financeiro">← Voltar ao fluxo de caixa</Link>
    <PageHeader eyebrow="Financeiro" title="Fechamento de caixa" description="Confira cada conta de destino pelo período entre a abertura e o encerramento, incluindo recebimentos, saídas e estornos." />
    <p className="text-sm text-muted">Saldo esperado = abertura + entradas − saídas. Pagamentos divididos entram em seus respectivos destinos. O fechamento registra o saldo conferido; não movimenta dinheiro entre contas.</p>
    {!accounts.length && <p className="panel text-sm text-amber-900">Cadastre uma conta ou caixa ativo. <Link className="font-bold underline" href="/financeiro?cadastros=contas">Cadastrar conta</Link></p>}
    <section className="grid gap-5 lg:grid-cols-2">
      {canManage && <ActionForm action={openCash} successMessage="Caixa aberto." className="panel grid content-start gap-3"><h2 className="text-lg font-extrabold">Abrir caixa</h2><label className="grid gap-2 text-sm font-bold">Conta / caixa<select className="field" name="accountId" required><option value="">Selecione</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label className="grid gap-2 text-sm font-bold">Saldo contado na abertura<input className="field" name="openingBalance" inputMode="decimal" required /></label><button className="primary-button" disabled={!accounts.length}>Abrir caixa</button></ActionForm>}
      <article className="panel"><h2 className="text-lg font-extrabold">Caixas abertos</h2><div className="mt-4 grid gap-4">{openCashList.map((cash, index) => <div className="rounded-xl border p-4" key={cash.id}>
        <h3 className="font-extrabold">{cash.account}</h3><p className="text-sm text-muted">Aberto em {date(cash.openedAt)} · abertura {money(cash.opening)}</p>
        <ul className="my-3 grid gap-1 text-sm">{summaries[index].map((group, position) => <li className="flex justify-between gap-3" key={position}><span>{group.name || "Histórico sem identificação da forma"}</span><strong>{money(group.amount)}</strong></li>)}</ul>
        <p className="font-bold text-brand">Saldo esperado agora: {money(cash.opening + summaries[index].reduce((sum, item) => sum + item.amount, 0))}</p>
        {canManage && <ActionForm action={closeCash} successMessage="Caixa fechado e conferido." className="mt-4 grid gap-3"><input type="hidden" name="id" value={cash.id} /><label className="grid gap-2 text-sm font-bold">Saldo contado no fechamento<input className="field" name="countedBalance" inputMode="decimal" required /></label><label className="grid gap-2 text-sm font-bold">Observação<input className="field" name="notes" maxLength={2000} /></label><button className="secondary-button">Fechar e conferir</button></ActionForm>}
      </div>)}{!openCashList.length && <p className="empty-state">Nenhum caixa aberto.</p>}</div></article>
    </section>
    <section className="panel"><h2 className="text-lg font-extrabold">Últimos 20 fechamentos</h2><div className="mt-4 grid gap-3">{history.map(cash => <article className="rounded-xl border p-4" key={cash.id}><h3 className="font-bold">{cash.account}</h3><p className="text-xs text-muted">{date(cash.openedAt)} até {cash.closedAt ? date(cash.closedAt) : ""}</p><p className="mt-2 text-sm">Esperado: {money(cash.expected ?? 0)} · Contado: {money(cash.counted ?? 0)} · <strong className={cash.difference ? "text-amber-800" : "text-brand"}>Diferença: {money(cash.difference ?? 0)}</strong></p>{cash.notes && <p className="mt-2 text-sm text-muted">{cash.notes}</p>}</article>)}{!history.length && <p className="empty-state">Nenhum fechamento registrado.</p>}</div></section>
  </div>;
}
