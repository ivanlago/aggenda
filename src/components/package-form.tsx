"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { importPreviousPackage, saveServicePackage } from "@/actions/package-catalog";
import { ActionForm } from "@/components/action-form";
import { FormActions, FormSection } from "@/components/form-dialog-context";
import { ModalShell } from "@/components/modal-shell";
import { packageSearch, type PackageProcedure, type PackageTemplate } from "@/lib/package-catalog";

export function PackageForm({ procedures, template }: { procedures: PackageProcedure[]; template?: PackageTemplate }) {
  const [selected, setSelected] = useState(template?.items ?? []);
  const [search, setSearch] = useState("");
  const choices = procedures.filter((item) => item.isActive !== false && !selected.some((line) => line.serviceId === item.id) && packageSearch(item.name).includes(packageSearch(search)));
  return <ActionForm action={saveServicePackage} successMessage="Pacote salvo." className="grid gap-5 sm:grid-cols-2" resetOnSuccess={false}>
    {template && <input type="hidden" name="id" value={template.id} />}
    <p className="col-span-full text-sm text-muted">Campos com * são obrigatórios.</p>
    {template && <p className="col-span-full rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Salvar cria uma nova versão e desativa este modelo. Os pacotes já adquiridos mantêm a composição, o preço e a validade originais. Orçamentos com o modelo anterior precisam ser revistos antes da venda.</p>}
    <FormSection title="Identificação"><label className="grid gap-2 text-sm font-bold sm:col-span-2">Nome do pacote *<input className="field" name="name" required minLength={2} maxLength={120} defaultValue={template?.name} placeholder="Ex.: Pacote com 6 sessões" /></label></FormSection>
    <FormSection title="Procedimentos e quantidades">
      <label className="grid gap-2 text-sm font-bold sm:col-span-2">Buscar procedimento<input className="field" type="search" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} placeholder="Digite para encontrar um procedimento" /></label>
      <div className="grid max-h-44 gap-2 overflow-y-auto rounded-xl border p-3 sm:col-span-2" aria-label="Procedimentos disponíveis">{choices.slice(0, 20).map((item) => <button key={item.id} className="flex items-center justify-between gap-3 rounded-lg p-2 text-left text-sm hover:bg-brand/5" type="button" aria-label={`Adicionar ${item.name}`} onClick={() => setSelected((items) => [...items, { serviceId: item.id, serviceName: item.name, quantity: 1 }])}><span>{item.name}</span><Plus className="size-4 shrink-0" /></button>)}{!choices.length && <p className="text-sm text-muted">Nenhum procedimento ativo disponível para esta busca.</p>}{choices.length > 20 && <p className="text-xs text-muted">Refine a busca para encontrar outros procedimentos.</p>}</div>
      <div className="grid gap-3 sm:col-span-2" aria-label="Composição do pacote">{selected.map((line) => <div className="flex flex-wrap items-end gap-3 rounded-xl border p-3" key={line.serviceId}><p className="min-w-0 flex-1 text-sm font-bold">{line.serviceName}{procedures.find((item) => item.id === line.serviceId)?.isActive === false ? " · Inativo: remova ou substitua" : ""}</p><label className="grid w-28 gap-1 text-sm font-bold">Sessões *<input className="field" type="number" min="1" max="10000" required name={`quantity:${line.serviceId}`} value={line.quantity} onChange={(event) => setSelected((items) => items.map((item) => item.serviceId === line.serviceId ? { ...item, quantity: Number(event.target.value) } : item))} aria-label={`Sessões de ${line.serviceName}`} /></label><button type="button" className="icon-button" aria-label={`Remover ${line.serviceName}`} onClick={() => setSelected((items) => items.filter((item) => item.serviceId !== line.serviceId))}><Trash2 className="size-4" /></button></div>)}{!selected.length && <p className="text-sm text-muted">Adicione ao menos um procedimento.</p>}</div>
      <p className="text-sm font-bold sm:col-span-2" aria-live="polite">{selected.length} procedimento(s) · {selected.reduce((sum, item) => sum + item.quantity, 0)} sessão(ões)</p>
    </FormSection>
    <FormSection title="Preço e validade">
      <label className="grid gap-2 text-sm font-bold">Preço do pacote (R$) *<input className="field" name="price" inputMode="decimal" required defaultValue={template ? (template.priceInCents / 100).toFixed(2).replace(".", ",") : ""} placeholder="499,00" /></label>
      <label className="grid gap-2 text-sm font-bold">Validade em dias<input className="field" name="validityDays" type="number" min="1" max="36500" defaultValue={template?.validityDays ?? ""} /><span className="text-xs font-normal text-muted">Contada a partir da aquisição. Vazio significa sem prazo.</span></label>
    </FormSection>
    <FormSection title="Condições adicionais"><label className="grid gap-2 text-sm font-bold sm:col-span-2">Descrição e condições<textarea className="field min-h-24" name="description" maxLength={5000} defaultValue={template?.description ?? ""} /></label></FormSection>
    <FormActions editing={Boolean(template)} disabled={!selected.length} />
  </ActionForm>;
}

export function PackageDialog(props: { procedures: PackageProcedure[]; template?: PackageTemplate }) {
  return <ModalShell title={props.template ? `Editar pacote: ${props.template.name}` : "Novo pacote"} variant={props.template ? "edit" : "new"} wide closeOnSuccess><PackageForm {...props} /></ModalShell>;
}

export function PreviousPackageForm({ templates, clients, today }: { templates: PackageTemplate[]; clients: { id: string; name: string }[]; today: string }) {
  const [templateId, setTemplateId] = useState("");
  const [registrationId] = useState(() => crypto.randomUUID());
  const template = templates.find((item) => item.id === templateId);
  return <ActionForm action={importPreviousPackage} successMessage="Pacote anterior registrado sem nova receita." resetOnSuccess={false} className="grid gap-5 sm:grid-cols-2">
    <input type="hidden" name="registrationId" value={registrationId} />
    <p className="col-span-full rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Use para um pacote adquirido antes do registro no Aggenda. Esta ação registra somente o histórico e as sessões restantes; não gera venda, cobrança ou receita. Para uma nova aquisição, use Venda e orçamento.</p>
    <p className="col-span-full text-sm text-muted">Campos com * são obrigatórios. Escolha o modelo correspondente às condições originais.</p>
    <FormSection title="Identificação">
      <label className="grid gap-2 text-sm font-bold">Cliente *<select className="field" name="clientId" required defaultValue=""><option value="">Selecione</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-bold">Modelo original *<select className="field" name="packageId" required value={templateId} onChange={(event) => setTemplateId(event.target.value)}><option value="">Selecione</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isActive ? "" : " · Modelo inativo"} · {(item.priceInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · {item.validityDays ? `${item.validityDays} dias` : "Sem prazo"}</option>)}</select></label>
    </FormSection>
    <FormSection title="Aquisição e validade">
      <label className="grid gap-2 text-sm font-bold">Data original da aquisição *<input className="field" name="purchasedOn" type="date" max={today} required /></label>
      <label className="grid gap-2 text-sm font-bold">Válido até<input className="field" name="expiresOn" type="date" /><span className="text-xs font-normal text-muted">Informe a validade original. Deixe vazio somente se não houver prazo.</span></label>
      <label className="grid gap-2 text-sm font-bold">Valor original (R$) *<input className="field" name="price" key={templateId} inputMode="decimal" required defaultValue={template ? (template.priceInCents / 100).toFixed(2).replace(".", ",") : ""} /><span className="text-xs font-normal text-muted">Informativo para o histórico; não gera lançamento financeiro.</span></label>
    </FormSection>
    <FormSection title="Sessões restantes">{template?.items.map((item) => <label key={`${templateId}:${item.serviceId}`} className="grid gap-2 text-sm font-bold">{item.serviceName} *<input className="field" type="number" name={`remaining:${item.serviceId}`} min="0" max={item.quantity} required placeholder={`De 0 a ${item.quantity}`} /></label>)}{!template && <p className="text-sm text-muted">Selecione o modelo original para informar os saldos.</p>}</FormSection>
    <FormSection title="Justificativa"><label className="grid gap-2 text-sm font-bold sm:col-span-2">Motivo do registro *<textarea className="field min-h-20" name="reason" required minLength={5} maxLength={2000} placeholder="Ex.: Migração de pacote adquirido antes do uso do Aggenda" /></label><label className="flex items-start gap-2 text-sm font-bold sm:col-span-2"><input type="checkbox" name="confirmPrevious" required />Confirmo que se trata de uma aquisição anterior e que este registro não deve gerar nova receita.</label></FormSection>
    <FormActions submitLabel="Registrar pacote anterior" disabled={!template || !clients.length || !template.items.length} />
  </ActionForm>;
}

export function PreviousPackageDialog(props: Parameters<typeof PreviousPackageForm>[0]) {
  return <ModalShell title="Registrar pacote anterior" variant="new" secondary wide closeOnSuccess><PreviousPackageForm {...props} /></ModalShell>;
}
