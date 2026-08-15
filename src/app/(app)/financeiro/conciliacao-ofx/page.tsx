import { and, asc, desc, eq } from "drizzle-orm";
import Link from "next/link";

import { importOfx, reconcileOfx } from "@/actions/financial-operations";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { bankImportTransactions, financialAccounts, financialEntries } from "@/db/schema";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Conciliação OFX" };
const money = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function OfxReconciliationPage() {
  const { organization } = await requireOrganization();
  const [accounts, transactions, pendingEntries] = await Promise.all([
    db.select().from(financialAccounts).where(eq(financialAccounts.organizationId, organization.id)).orderBy(asc(financialAccounts.name)),
    db.select().from(bankImportTransactions).where(and(eq(bankImportTransactions.organizationId, organization.id), eq(bankImportTransactions.status, "unmatched"))).orderBy(desc(bankImportTransactions.occurredOn)).limit(30),
    db.select({ id: financialEntries.id, description: financialEntries.description, amount: financialEntries.amountInCents }).from(financialEntries).where(and(eq(financialEntries.organizationId, organization.id), eq(financialEntries.status, "pending"))).orderBy(desc(financialEntries.dueDate)).limit(100),
  ]);

  return <div className="page-wrap">
    <Link className="mb-4 inline-flex text-sm font-bold text-brand" href="/financeiro">← Voltar ao fluxo de caixa</Link>
    <PageHeader eyebrow="Financeiro" title="Conciliação OFX" description="Importe o extrato bancário e vincule cada movimento ao lançamento correspondente." />
    <ActionForm action={importOfx} successMessage="OFX importado." className="panel flex flex-wrap gap-3"><select className="field max-w-xs" name="accountId" required><option value="">Conta de destino</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input className="field max-w-md" name="file" type="file" accept=".ofx,application/x-ofx" required /><button className="primary-button">Importar OFX</button><p className="w-full text-sm text-muted">O arquivo é processado pelo Aggenda; não há conexão bancária nem mensalidade de Open Finance.</p></ActionForm>
    <section className="panel mt-5"><h2 className="text-lg font-extrabold">Movimentos pendentes</h2><div className="mt-4 divide-y">{transactions.map((item) => <div className="grid gap-2 py-3 text-sm lg:grid-cols-[1fr_auto_1fr] lg:items-center" key={item.id}><span><strong>{item.description}</strong><br />{new Date(`${item.occurredOn}T12:00:00Z`).toLocaleDateString("pt-BR")}</span><strong className={item.amountInCents >= 0 ? "text-emerald-700" : "text-red-700"}>{money(item.amountInCents)}</strong><ActionForm action={reconcileOfx} successMessage="Movimento conciliado." className="flex gap-2"><input type="hidden" name="transactionId" value={item.id} /><select className="field" name="entryId" required><option value="">Vincular ao lançamento</option>{pendingEntries.filter((entry) => Math.abs(entry.amount - Math.abs(item.amountInCents)) <= 1).map((entry) => <option key={entry.id} value={entry.id}>{entry.description} · {money(entry.amount)}</option>)}</select><button className="secondary-button">Conciliar</button></ActionForm></div>)}{!transactions.length && <p className="empty-state">Nenhum movimento aguardando conciliação.</p>}</div></section>
  </div>;
}
