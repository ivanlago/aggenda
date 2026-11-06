"use client";

import { useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { savePaymentMethod, deletePaymentMethod } from "@/actions/payment-methods";
import { ActionForm } from "@/components/action-form";
import { FormActions } from "@/components/form-dialog-context";
import { ModalShell } from "@/components/modal-shell";
import { PaginatedCollection } from "@/components/paginated-collection";
import { paymentKindLabels, paymentKinds, type PaymentKind } from "@/lib/payment-catalog-policy";

type Method = { id: string; name: string; kind: string; provider: string; defaultAccountId: string | null; isActive: boolean };
type Account = { id: string; name: string; isActive: boolean };
const providers: Record<string, string> = { manual: "Manual / maquininha externa", mercado_pago: "Mercado Pago", asaas: "Asaas", pagbank: "PagBank", efi: "Efí Bank" };

function MethodForm({ method, accounts }: { method?: Method; accounts: Account[] }) {
  return <ActionForm action={savePaymentMethod} successMessage="Forma de pagamento salva." resetOnSuccess={false} className="grid gap-4 sm:grid-cols-2">
    {method && <input type="hidden" name="id" value={method.id} />}
    <label className="grid gap-2 text-sm font-bold sm:col-span-2">Nome *<input className="field" name="name" required minLength={2} maxLength={80} defaultValue={method?.name} /></label>
    <label className="grid gap-2 text-sm font-bold">Tipo *<select className="field" name="kind" defaultValue={method?.kind ?? "other"}>{paymentKinds.map(kind => <option key={kind} value={kind}>{paymentKindLabels[kind]}</option>)}</select></label>
    <label className="grid gap-2 text-sm font-bold">Conta de pagamento *<select className="field" name="defaultAccountId" required defaultValue={method?.defaultAccountId ?? ""}><option value="" disabled>Selecione uma conta</option>{accounts.filter(account => account.isActive || account.id === method?.defaultAccountId).map(account => <option key={account.id} value={account.id}>{account.name}{!account.isActive ? " (inativa)" : ""}</option>)}</select></label>
    <label className="grid gap-2 text-sm font-bold sm:col-span-2">Recebimento *<select className="field" name="provider" defaultValue={method?.provider ?? "manual"}>{Object.entries(providers).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="active" defaultChecked={method?.isActive ?? true} /> Disponível para novos pagamentos</label>
    <p className="text-xs text-muted sm:col-span-2">Campos com * são obrigatórios.</p>
    <FormActions editing={Boolean(method)} />
  </ActionForm>;
}

export function PaymentMethodsCatalog({ methods, accounts }: { methods: Method[]; accounts: Account[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = methods.filter(method => method.name.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")) && (status === "all" || method.isActive === (status === "active")));
  const accountNames = new Map(accounts.map(account => [account.id, account.name]));
  return <div className="grid min-w-0 gap-5">
    <div className="flex flex-wrap items-center gap-3">
      <ModalShell title="Nova forma de pagamento" variant="new" closeOnSuccess><MethodForm accounts={accounts} /></ModalShell>
      <Link className="secondary-button" href="/financeiro/cadastros">Contas de pagamento</Link>
    </div>
    <section className="panel min-w-0">
      <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
        <label className="grid gap-2 text-sm font-bold">Buscar por nome<input className="field" type="search" placeholder="Nome do pagamento" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label className="grid gap-2 text-sm font-bold">Status<select className="field" value={status} onChange={event => setStatus(event.target.value)}><option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label>
        <button className="secondary-button" type="button" onClick={() => { setSearch(""); setStatus("all"); }}>Limpar</button>
      </div>
      <p className="mb-4 text-sm text-muted" role="status">{filtered.length} forma(s) de pagamento</p>
      <table className="w-full table-fixed text-left text-sm">
        <caption className="sr-only">Formas de pagamento cadastradas</caption>
        <thead><tr className="border-b text-xs uppercase text-muted">
          <th scope="col" className="px-2 py-3">Nome do pagamento</th><th scope="col" className="hidden px-2 py-3 md:table-cell">Tipo</th><th scope="col" className="hidden px-2 py-3 lg:table-cell">Recebimento</th><th scope="col" className="px-2 py-3">Conta de pagamento</th><th scope="col" className="w-20 px-2 py-3">Status</th><th scope="col" className="w-20 px-1 py-3 text-center sm:w-24">Ações</th>
        </tr></thead>
        <PaginatedCollection as="tbody" label="Formas de pagamento" className="divide-y">
          {filtered.map(method => <tr key={method.id} className="odd:bg-slate-50/60">
            <td className="break-words px-2 py-4 font-bold">{method.name}<span className="mt-1 block text-xs font-normal text-muted md:hidden">{paymentKindLabels[method.kind as PaymentKind] ?? method.kind}</span></td>
            <td className="hidden break-words px-2 py-4 md:table-cell">{paymentKindLabels[method.kind as PaymentKind] ?? method.kind}</td>
            <td className="hidden break-words px-2 py-4 lg:table-cell">{providers[method.provider] ?? method.provider}</td>
            <td className="break-words px-2 py-4">{method.defaultAccountId ? accountNames.get(method.defaultAccountId) ?? "Conta indisponível" : "Sem conta cadastrada"}</td>
            <td className="px-2 py-4"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${method.isActive ? "bg-teal-50 text-brand" : "bg-slate-100 text-slate-600"}`}>{method.isActive ? "Ativo" : "Inativo"}</span></td>
            <td className="px-1 py-4"><div className="flex flex-wrap items-center justify-center gap-1">
              <ModalShell title={`Editar ${method.name}`} variant="edit" closeOnSuccess><MethodForm method={method} accounts={accounts} /></ModalShell>
              <ActionForm action={deletePaymentMethod} successMessage="Forma de pagamento excluída."><input type="hidden" name="id" value={method.id} /><button className="icon-button text-red-600" type="submit" aria-label={`Excluir ${method.name}`} onClick={event => { if (!window.confirm(`Excluir “${method.name}”? Formas com movimentações vinculadas devem ser desativadas.`)) event.preventDefault(); }}><Trash2 className="size-4" aria-hidden="true" /></button></ActionForm>
            </div></td>
          </tr>)}
        </PaginatedCollection>
      </table>
      {!filtered.length && <p className="empty-state">{methods.length ? "Nenhuma forma de pagamento encontrada para os filtros." : "Nenhuma forma de pagamento cadastrada. Use o botão acima para começar."}</p>}
    </section>
  </div>;
}
