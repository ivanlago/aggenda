import { PaginatedCollection } from "@/components/paginated-collection";
import { and, asc, eq, isNull } from "drizzle-orm";
import Link from "next/link";

import { closeCash, openCash } from "@/actions/financial-operations";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { cashClosings, financialAccounts } from "@/db/schema";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Fechamento de caixa" };
const money = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function CashClosingPage() {
  const { organization } = await requireOrganization();
  const [accounts, openCashList] = await Promise.all([
    db.select().from(financialAccounts).where(and(eq(financialAccounts.organizationId, organization.id), eq(financialAccounts.isActive, true))).orderBy(asc(financialAccounts.name)),
    db.select({ id: cashClosings.id, account: financialAccounts.name, opening: cashClosings.openingBalanceInCents, openedAt: cashClosings.openedAt }).from(cashClosings).innerJoin(financialAccounts, eq(financialAccounts.id, cashClosings.accountId)).where(and(eq(cashClosings.organizationId, organization.id), isNull(cashClosings.closedAt))),
  ]);

  return <div className="page-wrap">
    <Link className="mb-4 inline-flex text-sm font-bold text-brand" href="/financeiro">← Voltar ao fluxo de caixa</Link>
    <PageHeader eyebrow="Financeiro" title="Fechamento de caixa" description="Abra, confira e encerre caixas físicos ou contas operacionais separadamente." />
    {!accounts.length && <p className="panel mb-5 text-sm text-amber-900">Cadastre uma conta ou caixa ativo antes de continuar. <Link className="font-bold underline" href="/financeiro?cadastros=contas">Cadastrar conta</Link></p>}
    <section className="grid gap-5 lg:grid-cols-2">
      <ActionForm action={openCash} successMessage="Caixa aberto." className="panel grid content-start gap-3"><h2 className="text-lg font-extrabold">Abrir caixa</h2><label className="grid gap-2 text-sm font-bold">Conta / caixa<select className="field" name="accountId" required><option value="">Conta ou caixa</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="grid gap-2 text-sm font-bold">Saldo contado na abertura<input className="field" name="openingBalance" inputMode="decimal" required placeholder="Saldo contado na abertura" /></label><button className="primary-button" disabled={!accounts.length}>Abrir caixa</button></ActionForm>
      <article className="panel"><h2 className="text-lg font-extrabold">Caixas abertos</h2><PaginatedCollection label="Registros" className="mt-4 grid gap-3">{openCashList.map((item) => <ActionForm action={closeCash} successMessage="Caixa fechado." className="rounded-2xl border p-4" key={item.id}><input type="hidden" name="id" value={item.id} /><p className="font-bold">{item.account} · abertura {money(item.opening)}</p><p className="mt-1 text-xs text-muted">Aberto em {item.openedAt.toLocaleString("pt-BR", { timeZone: organization.timezone })}</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="grid gap-2 text-sm font-bold">Saldo contado no fechamento<input className="field" name="countedBalance" inputMode="decimal" required placeholder="Saldo contado" /></label><label className="grid gap-2 text-sm font-bold">Observação<input className="field" name="notes" placeholder="Observação" /></label><button className="secondary-button sm:col-span-2">Fechar e conferir</button></div></ActionForm>)}{!openCashList.length && <p className="empty-state">Nenhum caixa aberto.</p>}</PaginatedCollection></article>
    </section>
  </div>;
}
