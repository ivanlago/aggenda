"use client";

import { useState } from "react";
import { Power, RotateCcw } from "lucide-react";
import { changeReference } from "@/actions/reference-records";
import { ActionForm } from "@/components/action-form";
import { ModalShell } from "@/components/modal-shell";
import { ReferenceRecordForm } from "@/components/reference-records";
import { PaginatedCollection } from "@/components/paginated-collection";
import { financialCategoryLabels, type ReferenceRecord } from "@/lib/reference-records";

type Kind = "financial_account" | "financial_category";
const names: Record<Kind, { create: string; singular: string }> = {
  financial_account: { create: "Nova conta ou caixa", singular: "conta ou caixa" },
  financial_category: { create: "Nova categoria", singular: "categoria financeira" },
};
const accountTypes: Record<string, string> = { bank: "Conta bancária", cash: "Caixa físico", digital_wallet: "Carteira digital" };

export function FinancialReferenceCatalog({ kind, records }: { kind: Kind; records: ReferenceRecord[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = records.filter(record => record.name.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")) && (status === "all" || (record.isActive !== false) === (status === "active")));
  const name = names[kind];
  return <div className="grid min-w-0 gap-5">
    <ModalShell title={name.create} variant="new" closeOnSuccess><ReferenceRecordForm kind={kind} /></ModalShell>
    <section className="panel min-w-0">
      <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
        <label className="grid gap-2 text-sm font-bold">Buscar por nome<input className="field" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome do cadastro" /></label>
        <label className="grid gap-2 text-sm font-bold">Status<select className="field" value={status} onChange={event => setStatus(event.target.value)}><option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label>
        <button type="button" className="secondary-button" onClick={() => { setSearch(""); setStatus("all"); }}>Limpar</button>
      </div>
      <p className="mb-4 text-sm text-muted" role="status">{filtered.length} registro(s)</p>
      <table className="w-full table-fixed text-left text-sm">
        <caption className="sr-only">Lista de cadastros financeiros</caption>
        <thead><tr className="border-b text-xs uppercase text-muted"><th scope="col" className="px-2 py-3">Nome</th><th scope="col" className="px-2 py-3">Tipo</th><th scope="col" className="w-20 px-2 py-3">Status</th><th scope="col" className="w-20 px-1 py-3 text-center sm:w-24">Ações</th></tr></thead>
        <PaginatedCollection as="tbody" tableColumns={4} label="Cadastros financeiros" className="divide-y">
          {filtered.map(record => <tr key={record.id} className="odd:bg-slate-50/60">
            <td className="break-words px-2 py-4 font-bold">{record.name}</td>
            <td className="break-words px-2 py-4">{kind === "financial_account" ? accountTypes[record.accountType ?? "bank"] ?? record.accountType : financialCategoryLabels[record.type ?? ""] ?? record.type}</td>
            <td className="px-2 py-4"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${record.isActive !== false ? "bg-teal-50 text-brand" : "bg-slate-100 text-slate-600"}`}>{record.isActive !== false ? "Ativo" : "Inativo"}</span></td>
            <td className="px-1 py-4"><div className="flex flex-wrap items-center justify-center gap-1">
              <ModalShell title={`Editar ${record.name}`} variant="edit" closeOnSuccess><ReferenceRecordForm kind={kind} record={record} /></ModalShell>
              <ActionForm action={changeReference} successMessage={record.isActive === false ? "Cadastro reativado." : "Cadastro desativado."}>
                <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={record.id} /><input type="hidden" name="operation" value={record.isActive === false ? "activate" : "deactivate"} />
                <button type="submit" className="icon-button" title={`${record.isActive === false ? "Reativar" : "Desativar"} ${record.name}`} aria-label={`${record.isActive === false ? "Reativar" : "Desativar"} ${record.name}`}>{record.isActive === false ? <RotateCcw className="size-4" aria-hidden="true" /> : <Power className="size-4" aria-hidden="true" />}</button>
              </ActionForm>
            </div></td>
          </tr>)}
        </PaginatedCollection>
      </table>
      {!filtered.length && <p className="empty-state">{records.length ? "Nenhum cadastro encontrado para os filtros." : `Nenhum cadastro disponível. Use o botão “${name.create}” para começar.`}</p>}
      <p className="mt-4 text-xs text-muted">Desativar impede novas seleções e preserva os lançamentos existentes.</p>
    </section>
  </div>;
}
