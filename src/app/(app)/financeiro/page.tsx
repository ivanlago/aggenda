import { and, eq, gte, lt, or } from "drizzle-orm";
import { ArrowDownCircle, ArrowUpCircle, Trash2, WalletCards } from "lucide-react";
import Link from "next/link";

import {
  createFinancialEntry,
  deleteFinancialEntry,
  updateFinancialEntryStatus,
} from "@/actions/app";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { financialEntries } from "@/db/schema";
import { organizationDate } from "@/lib/appointment-safety";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Fluxo de caixa" };

const money = (value: number) =>
  (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const sourceLabels: Record<string, string> = {
  manual: "Manual",
  appointment: "Agendamento",
  package: "Pacote",
};

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { organization } = await requireOrganization();
  const query = await searchParams;
  const currentMonth = organizationDate(new Date(), organization.timezone).slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(query.mes ?? "") ? query.mes! : currentMonth;
  const [year, monthNumber] = month.split("-").map(Number);
  const nextMonthDate = new Date(Date.UTC(year, monthNumber, 1));
  const nextMonth = `${nextMonthDate.getUTCFullYear()}-${String(nextMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const firstDay = `${month}-01`;
  const nextFirstDay = `${nextMonth}-01`;
  const canManage = hasOrganizationPermission(organization.role, "finance.manage");

  const entries = await db.select().from(financialEntries).where(and(
    eq(financialEntries.organizationId, organization.id),
    or(
      and(gte(financialEntries.dueDate, firstDay), lt(financialEntries.dueDate, nextFirstDay)),
      and(gte(financialEntries.realizedDate, firstDay), lt(financialEntries.realizedDate, nextFirstDay))
    )
  )).orderBy(financialEntries.dueDate, financialEntries.createdAt);

  const dueThisMonth = entries.filter((entry) => entry.dueDate >= firstDay && entry.dueDate < nextFirstDay);
  const realizedThisMonth = entries.filter((entry) => entry.realizedDate && entry.realizedDate >= firstDay && entry.realizedDate < nextFirstDay);
  const received = realizedThisMonth.filter((entry) => entry.type === "receivable" && entry.status === "received").reduce((sum, entry) => sum + entry.amountInCents, 0);
  const paid = realizedThisMonth.filter((entry) => entry.type === "payable" && entry.status === "paid").reduce((sum, entry) => sum + entry.amountInCents, 0);
  const receivable = dueThisMonth.filter((entry) => entry.type === "receivable" && entry.status === "pending").reduce((sum, entry) => sum + entry.amountInCents, 0);
  const payable = dueThisMonth.filter((entry) => entry.type === "payable" && entry.status === "pending").reduce((sum, entry) => sum + entry.amountInCents, 0);

  return (
    <div className="page-wrap">
      <PageHeader eyebrow="Financeiro" title="Fluxo de caixa" description="Acompanhe entradas, saídas e previsões geradas pela operação do Aggenda." />
      <form method="get" className="panel mb-5 flex flex-wrap items-end gap-3">
        <label className="grid gap-2 text-sm font-bold">Período<input className="field" type="month" name="mes" defaultValue={month} /></label>
        <button className="primary-button py-3">Visualizar</button>
        {month !== currentMonth && <Link className="text-sm font-bold text-brand underline" href="/financeiro">Voltar ao mês atual</Link>}
      </form>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="panel"><ArrowUpCircle className="size-5 text-emerald-600" /><p className="mt-5 text-sm text-muted">Recebido</p><p className="mt-1 text-2xl font-extrabold text-emerald-700">{money(received)}</p></article>
        <article className="panel"><ArrowDownCircle className="size-5 text-red-600" /><p className="mt-5 text-sm text-muted">Pago</p><p className="mt-1 text-2xl font-extrabold text-red-700">{money(paid)}</p></article>
        <article className="panel"><WalletCards className="size-5 text-brand" /><p className="mt-5 text-sm text-muted">Saldo realizado</p><p className="mt-1 text-2xl font-extrabold">{money(received - paid)}</p></article>
        <article className="panel"><WalletCards className="size-5 text-amber-600" /><p className="mt-5 text-sm text-muted">Saldo previsto</p><p className="mt-1 text-2xl font-extrabold">{money(receivable - payable)}</p><p className="mt-1 text-xs text-muted">A receber {money(receivable)} · a pagar {money(payable)}</p></article>
      </section>

      {canManage && <ActionForm action={createFinancialEntry} successMessage="Lançamento financeiro criado." className="panel form-stack mt-5">
        <h2 className="text-lg font-extrabold">Novo lançamento manual</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <select className="field" name="type" required defaultValue="receivable"><option value="receivable">Conta a receber</option><option value="payable">Conta a pagar</option></select>
          <input className="field" name="description" required placeholder="Descrição" />
          <input className="field" name="category" placeholder="Categoria (ex.: Aluguel, Materiais)" />
          <input className="field" name="amount" inputMode="decimal" required placeholder="Valor (ex.: 350,00)" />
          <label className="grid gap-2 text-sm font-bold">Vencimento<input className="field" name="dueDate" type="date" required defaultValue={`${month}-01`} /></label>
          <select className="field" name="paymentMethod" defaultValue=""><option value="">Forma de pagamento</option><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="credit_card">Cartão de crédito</option><option value="debit_card">Cartão de débito</option><option value="bank_transfer">Transferência</option><option value="boleto">Boleto</option><option value="other">Outra</option></select>
        </div>
        <textarea className="field min-h-20" name="notes" placeholder="Observações" />
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="realized" /> Já foi pago/recebido</label>
        <button className="primary-button sm:w-fit">Adicionar lançamento</button>
      </ActionForm>}

      <section className="panel mt-5">
        <h2 className="text-lg font-extrabold">Lançamentos do período</h2>
        <div className="mt-4 divide-y">
          {entries.map((entry) => {
            const realized = entry.status === "paid" || entry.status === "received";
            return <article key={entry.id} className="grid gap-3 py-4 lg:grid-cols-[1fr_auto_auto] lg:items-center">
              <div>
                <p className="font-extrabold">{entry.description}</p>
                <p className="mt-1 text-xs text-muted">{entry.category || "Sem categoria"} · {sourceLabels[entry.source] ?? entry.source} · vencimento {new Date(`${entry.dueDate}T12:00:00Z`).toLocaleDateString("pt-BR")}</p>
                {entry.realizedDate && <p className="mt-1 text-xs font-bold text-brand">{entry.type === "payable" ? "Pago" : "Recebido"} em {new Date(`${entry.realizedDate}T12:00:00Z`).toLocaleDateString("pt-BR")}</p>}
              </div>
              <div className="lg:text-right"><p className={`font-extrabold ${entry.type === "receivable" ? "text-emerald-700" : "text-red-700"}`}>{entry.type === "receivable" ? "+" : "−"} {money(entry.amountInCents)}</p><span className="status-pill">{entry.status === "pending" ? "Pendente" : entry.status === "cancelled" ? "Cancelado" : entry.type === "payable" ? "Pago" : "Recebido"}</span></div>
              {canManage && <div className="flex items-center gap-2">
                <ActionForm action={updateFinancialEntryStatus} successMessage="Lançamento atualizado." className="flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={entry.id} />
                  <select className="field py-2" name="status" defaultValue={realized ? "realized" : entry.status}><option value="pending">Pendente</option><option value="realized">{entry.type === "payable" ? "Pago" : "Recebido"}</option><option value="cancelled">Cancelado</option></select>
                  <input className="field py-2" name="realizedDate" type="date" aria-label="Data da baixa" />
                  <button className="text-xs font-extrabold text-brand">Salvar</button>
                </ActionForm>
                {entry.source === "manual" && <ActionForm action={deleteFinancialEntry} successMessage="Lançamento excluído."><input type="hidden" name="id" value={entry.id} /><button className="icon-button" aria-label="Excluir lançamento"><Trash2 className="size-4" /></button></ActionForm>}
              </div>}
            </article>;
          })}
          {!entries.length && <p className="empty-state">Nenhum lançamento neste período.</p>}
        </div>
      </section>
    </div>
  );
}
