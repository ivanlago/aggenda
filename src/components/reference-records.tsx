"use client";

import { useId, useRef, useState } from "react";
import { Pencil, Plus, Tags } from "lucide-react";
import { changeReference, saveReference } from "@/actions/reference-records";
import { ActionForm } from "@/components/action-form";
import { ModalShell } from "@/components/modal-shell";
import { FormActions, useFormDialog } from "@/components/form-dialog-context";
import { PaginatedCollection } from "@/components/paginated-collection";
import { isFinancialReference, referenceLabels, type ReferenceKind, type ReferenceRecord } from "@/lib/reference-records";

export function ReferenceRecordForm({ kind, record, parents = [], parentId, financialType, onSaved }: {
  kind: ReferenceKind; record?: ReferenceRecord; parents?: ReferenceRecord[]; parentId?: string; financialType?: string; onSaved?: (record: ReferenceRecord) => void;
}) {
  const { finishAuxiliary } = useFormDialog();
  return <ActionForm action={saveReference} successMessage="Cadastro salvo." className="grid gap-4" resetOnSuccess={false} onSuccess={(result) => {
    if (result?.record) { onSaved?.(result.record); finishAuxiliary(); }
  }}>
    <input type="hidden" name="kind" value={kind} />{record && <input type="hidden" name="id" value={record.id} />}
    <p className="text-sm text-muted">Campos com * são obrigatórios.</p>
    <label className="grid gap-2 text-sm font-bold">Nome *<input className="field" name="name" required minLength={2} maxLength={80} defaultValue={record?.name} autoFocus /></label>
    {kind === "product_subcategory" && !record && <label className="grid gap-2 text-sm font-bold">Categoria *<select className="field" name="categoryId" required defaultValue={parentId ?? ""}><option value="">Selecione</option>{parents.map((parent) => <option key={parent.id} value={parent.id}>{parent.name}</option>)}</select></label>}
    {kind === "financial_category" && !record && <label className="grid gap-2 text-sm font-bold">Tipo *<select className="field" name="type" defaultValue={financialType ?? "receivable"}><option value="receivable">Receita</option><option value="payable">Despesa</option></select></label>}
    {kind === "financial_account" && !record && <>
      <label className="grid gap-2 text-sm font-bold">Tipo de conta *<select className="field" name="accountType" defaultValue="bank"><option value="bank">Conta bancária</option><option value="cash">Caixa físico</option><option value="digital_wallet">Carteira digital</option></select></label>
      <label className="grid gap-2 text-sm font-bold">Saldo inicial (R$)<input className="field" name="openingBalance" inputMode="decimal" defaultValue="0,00" /></label>
    </>}
    {record && isFinancialReference(kind) && <p className="text-sm text-muted">A edição altera o nome. Tipo e saldo inicial são preservados para manter o histórico financeiro.</p>}
    {record && kind === "product_subcategory" && <p className="text-sm text-muted">A categoria da subcategoria é preservada. Para mudar a classificação, edite os produtos vinculados.</p>}
    <FormActions editing={Boolean(record)} />
  </ActionForm>;
}

export function ReferenceSelect({ kind, name, label, records, defaultValue = "", value, onChange, onCreated, parents = [], parentId, financialType, required = false, disabled = false, emptyLabel = "Não informado" }: {
  kind: ReferenceKind; name: string; label: string; records: ReferenceRecord[]; defaultValue?: string; value?: string; onChange?: (value: string) => void; onCreated?: (record: ReferenceRecord) => void; parents?: ReferenceRecord[]; parentId?: string; financialType?: string; required?: boolean; disabled?: boolean; emptyLabel?: string;
}) {
  const { openAuxiliary } = useFormDialog();
  const [selected, setSelected] = useState(defaultValue);
  const [created, setCreated] = useState<ReferenceRecord[]>([]);
  const selectRef = useRef<HTMLSelectElement>(null);
  const id = useId();
  const options = [...new Map([...created, ...records].map((record) => [record.id, record])).values()];
  const current = value ?? selected;
  const visible = options.filter((record) => (record.isActive !== false || record.id === current) && (kind !== "product_subcategory" || record.categoryId === parentId) && (kind !== "financial_category" || !financialType || record.type === financialType));
  const select = (next: string) => { setSelected(next); onChange?.(next); };
  const validValue = visible.some((record) => record.id === current) ? current : "";
  return <div className="grid min-w-0 content-start gap-2">
    <div className="flex flex-wrap items-center justify-between gap-2"><label className="text-sm font-bold" htmlFor={id}>{label}{required ? " *" : ""}</label>
      <button type="button" className="text-xs font-bold text-brand disabled:opacity-50" disabled={disabled || (kind === "product_subcategory" && !parentId)} onClick={() => openAuxiliary(`Cadastrar ${referenceLabels[kind].singular}`, <ReferenceRecordForm kind={kind} parents={parents} parentId={parentId} financialType={financialType} onSaved={(record) => {
        setCreated((items) => [...items, record]); onCreated?.(record); select(record.id); requestAnimationFrame(() => selectRef.current?.focus());
      }} />, selectRef.current)}>+ {kind === "financial_account" ? "Nova conta" : kind === "cost_center" ? "Novo centro de custo" : `Nova ${referenceLabels[kind].singular}`}</button>
    </div>
    <select ref={selectRef} id={id} className="field" name={name} value={validValue} required={required} disabled={disabled} onChange={(event) => select(event.target.value)}><option value="">{emptyLabel}</option>{visible.map((record) => <option key={record.id} value={record.id}>{record.name}{record.isActive === false ? " (inativo)" : ""}</option>)}</select>
  </div>;
}

export type ReferenceGroup = { kind: ReferenceKind; records: ReferenceRecord[]; parents?: ReferenceRecord[] };

function ReferenceManagerContent({ groups }: { groups: ReferenceGroup[] }) {
  const [kind, setKind] = useState(groups[0].kind);
  const [search, setSearch] = useState("");
  const { openAuxiliary } = useFormDialog();
  const group = groups.find((item) => item.kind === kind)!;
  const label = referenceLabels[kind];
  const records = group.records.filter((record) => record.name.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR")));
  return <div className="grid gap-5">
    {groups.length > 1 && <div className="flex flex-wrap gap-2" role="group" aria-label="Tipos de cadastro">{groups.map((item) => <button key={item.kind} type="button" aria-pressed={kind === item.kind} className={kind === item.kind ? "primary-button" : "secondary-button"} onClick={() => { setKind(item.kind); setSearch(""); }}>{referenceLabels[item.kind].plural}</button>)}</div>}
    <div className="flex flex-wrap items-end justify-between gap-3"><label className="grid min-w-0 flex-1 gap-2 text-sm font-bold">Buscar por nome<input className="field" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label><button className="primary-button" type="button" onClick={() => openAuxiliary(`Cadastrar ${label.singular}`, <ReferenceRecordForm kind={kind} parents={group.parents} />)}><Plus className="size-4" />{kind === "financial_account" ? "Nova conta" : kind === "cost_center" ? "Novo centro de custo" : `Nova ${label.singular}`}</button></div>
    <p className="text-sm text-muted">{records.length} registro(s){isFinancialReference(kind) ? ". Desativar impede novas seleções e preserva os lançamentos existentes." : kind === "service_category" ? ". Ao excluir uma categoria, os procedimentos ficam sem categoria." : ". Registros vinculados precisam ser reclassificados antes da exclusão."}</p>
    <PaginatedCollection key={`${kind}:${search}`} label={label.plural} className="divide-y">{records.map((record) => <div className="flex flex-wrap items-center gap-3 py-3" key={record.id}>
      <div className="min-w-0 flex-1"><p className="font-bold">{record.name}</p><p className="text-xs text-muted">{kind === "product_subcategory" ? group.parents?.find((parent) => parent.id === record.categoryId)?.name : kind === "financial_category" ? record.type === "payable" ? "Despesa" : "Receita" : kind === "financial_account" ? ({ bank: "Conta bancária", cash: "Caixa físico", digital_wallet: "Carteira digital" }[record.accountType ?? "bank"]) : ""}{isFinancialReference(kind) ? ` · ${record.isActive === false ? "Inativo" : "Ativo"}` : ""}</p></div>
      <button className="icon-button" type="button" aria-label={`Editar ${record.name}`} onClick={() => openAuxiliary(`Editar ${label.singular}`, <ReferenceRecordForm kind={kind} record={record} parents={group.parents} />)}><Pencil className="size-4" /></button>
      <ActionForm action={changeReference} successMessage="Cadastro atualizado."><input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={record.id} /><input type="hidden" name="operation" value={isFinancialReference(kind) ? record.isActive === false ? "activate" : "deactivate" : "delete"} /><button className="secondary-button text-sm" type="submit" aria-label={`${isFinancialReference(kind) ? record.isActive === false ? "Reativar" : "Desativar" : "Excluir"} ${record.name}`} onClick={(event) => {
        if (!isFinancialReference(kind) && !window.confirm(kind === "service_category" ? `Excluir “${record.name}”? Os procedimentos vinculados ficarão sem categoria.` : `Excluir “${record.name}”?`)) event.preventDefault();
      }}>{isFinancialReference(kind) ? record.isActive === false ? "Reativar" : "Desativar" : "Excluir"}</button></ActionForm>
    </div>)}{!records.length && <p className="empty-state">{search ? "Nenhum resultado para a busca." : "Nenhum registro cadastrado. Use o botão acima para começar."}</p>}</PaginatedCollection>
  </div>;
}

export function ReferenceManager({ title = "Categorias", groups, defaultOpen = false }: { title?: string; groups: ReferenceGroup[]; defaultOpen?: boolean }) {
  return <ModalShell title={title} variant="new" defaultOpen={defaultOpen} secondary triggerLabel={title} triggerIcon={<Tags className="size-4" aria-hidden="true" />} wide={groups.length > 1} description="Cadastre e organize as opções disponíveis nos formulários."><ReferenceManagerContent groups={groups} /></ModalShell>;
}
