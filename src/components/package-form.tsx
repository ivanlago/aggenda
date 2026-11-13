"use client";

import { ItemCommissionField } from "@/components/item-commission-field";
import { useId, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { saveServicePackage } from "@/actions/package-catalog";
import { ActionForm } from "@/components/action-form";
import { FormActions } from "@/components/form-dialog-context";
import { ModalShell } from "@/components/modal-shell";
import { packageSearch, type PackageProcedure, type PackageTemplate } from "@/lib/package-catalog";

export function PackageForm({ procedures, template }: { procedures: PackageProcedure[]; template?: PackageTemplate }) {
  const [selected, setSelected] = useState(template?.items ?? []);
  const [search, setSearch] = useState("");
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const descriptionId = useId();
  const choices = procedures.filter((item) => item.isActive !== false && !selected.some((line) => line.serviceId === item.id) && packageSearch(item.name).includes(packageSearch(search)));
  return <ActionForm action={saveServicePackage} successMessage="Pacote salvo." className="grid gap-5 sm:grid-cols-2" resetOnSuccess={false}>
    {template && <input type="hidden" name="id" value={template.id} />}
    {template && <p className="col-span-full rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Salvar cria uma nova versão e desativa este modelo. Os pacotes já adquiridos mantêm a composição, o preço e a validade originais. Orçamentos com o modelo anterior precisam ser revistos antes da venda.</p>}
    <label className="col-span-full grid gap-2 text-sm font-bold">Nome do pacote *<input className="field" name="name" required minLength={2} maxLength={120} defaultValue={template?.name} placeholder="Ex.: Pacote com 6 sessões" /></label>
      <label className="grid gap-2 text-sm font-bold">Preço do pacote (R$) *<input className="field" name="price" inputMode="decimal" required defaultValue={template ? (template.priceInCents / 100).toFixed(2).replace(".", ",") : ""} placeholder="499,00" /></label>
      <label className="grid gap-2 text-sm font-bold">Validade em dias<input className="field" name="validityDays" type="number" min="1" max="36500" defaultValue={template?.validityDays ?? ""} /><span className="text-xs font-normal text-muted">Contada a partir da aquisição. Vazio significa sem prazo.</span></label>
      <ItemCommissionField value={template?.commissionRateBasisPoints} executionValue={template?.executionCommissionRateBasisPoints??0} />
    <div className="col-span-full grid min-w-0 items-start gap-4 md:grid-cols-2">
      <div className="grid min-w-0 gap-2">
        <label className="grid gap-2 text-sm font-bold">Buscar serviço<input className="field" type="search" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} placeholder="Digite para encontrar um serviço" /></label>
        <div className="grid max-h-48 gap-1 overflow-y-auto rounded-xl border p-2" aria-label="Serviços disponíveis">{choices.slice(0, 20).map((item) => <button key={item.id} className="flex items-center justify-between gap-3 rounded-lg p-2 text-left text-sm hover:bg-brand/5 focus-visible:outline-brand" type="button" aria-label={`Adicionar ${item.name}`} onClick={() => setSelected((items) => [...items, { serviceId: item.id, serviceName: item.name, quantity: 1 }])}><span className="min-w-0 break-words">{item.name}</span><Plus className="size-4 shrink-0 text-brand" aria-hidden="true" /></button>)}{!choices.length && <p className="p-2 text-sm text-muted">Nenhum serviço ativo disponível para esta busca.</p>}{choices.length > 20 && <p className="p-2 text-xs text-muted">Refine a busca para encontrar outros serviços.</p>}</div>
      </div>
      <div className="grid min-w-0 gap-2" role="group" aria-label="Composição do pacote">
        <p className="text-sm font-bold">Serviços do pacote *</p>
        <div className="divide-y rounded-xl border px-3">{selected.map((line) => <div className="flex flex-wrap items-end gap-2 py-3" key={line.serviceId}><div className="min-w-0 flex-1 self-center break-words text-sm font-bold">{line.serviceName}{procedures.find((item) => item.id === line.serviceId)?.isActive === false && <span className="block text-xs font-normal text-amber-800">Inativo: remova ou substitua</span>}</div><label className="grid w-24 gap-1 text-xs font-bold">Sessões *<input className="field px-2" type="number" min="1" max="10000" required name={`quantity:${line.serviceId}`} value={line.quantity} onChange={(event) => setSelected((items) => items.map((item) => item.serviceId === line.serviceId ? { ...item, quantity: Number(event.target.value) } : item))} aria-label={`Sessões de ${line.serviceName}`} /></label><button type="button" className="icon-button" aria-label={`Remover ${line.serviceName}`} onClick={() => setSelected((items) => items.filter((item) => item.serviceId !== line.serviceId))}><Trash2 className="size-4" aria-hidden="true" /></button></div>)}{!selected.length && <p className="py-3 text-sm text-muted">Adicione ao menos um serviço.</p>}</div>
        <p className="text-xs text-muted" aria-live="polite">{selected.length} serviço(s) · {selected.reduce((sum, item) => sum + item.quantity, 0)} sessão(ões)</p>
      </div>
    </div>
    <button type="button" className="secondary-button col-span-full w-fit" aria-expanded={descriptionOpen} aria-controls={descriptionId} onClick={() => setDescriptionOpen(open => !open)}>
      Descrição e condições<ChevronDown aria-hidden="true" className={`size-4 transition-transform ${descriptionOpen ? "rotate-180" : ""}`} />
    </button>
    <div id={descriptionId} className="col-span-full" hidden={!descriptionOpen}>
      <label className="grid gap-2 text-sm font-bold">Descrição e condições<textarea className="field min-h-24" name="description" maxLength={5000} defaultValue={template?.description ?? ""} /></label>
    </div>
    <p className="col-span-full text-sm text-muted">Campos com * são obrigatórios.</p>
    <FormActions editing={Boolean(template)} disabled={!selected.length} />
  </ActionForm>;
}

export function PackageDialog(props: { procedures: PackageProcedure[]; template?: PackageTemplate }) {
  return <ModalShell title={props.template ? `Editar pacote: ${props.template.name}` : "Novo pacote"} variant={props.template ? "edit" : "new"} wide closeOnSuccess><PackageForm {...props} /></ModalShell>;
}
