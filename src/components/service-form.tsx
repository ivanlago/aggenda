"use client";

import { createService, updateService } from "@/actions/app";
import { ActionForm } from "@/components/action-form";
import { EntityImageField } from "@/components/entity-image-field";
import { FormActions, FormSection } from "@/components/form-dialog-context";
import { ReferenceSelect } from "@/components/reference-records";
import { ServiceDepositFields } from "@/components/service-deposit-fields";
import { ServiceReturnFields } from "@/components/service-return-fields";
import { ServiceRepeatPolicy } from "@/components/service-repeat-policy";
import { TussAutocomplete } from "@/components/tuss-autocomplete";
import type { services } from "@/db/schema";
import type { ReferenceRecord } from "@/lib/reference-records";

export function ServiceForm({ item, label, categories }: { item?: typeof services.$inferSelect; label: string; categories: ReferenceRecord[] }) {
  const money = (cents: number | null | undefined) => cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",");
  return <ActionForm action={item ? updateService : createService} successMessage={item ? "Procedimento atualizado." : "Procedimento cadastrado."} resetOnSuccess={false} className="grid min-w-0 gap-5 sm:grid-cols-2">
    <p className="col-span-full text-sm text-muted">Campos com * são obrigatórios.</p>
    {item && <input type="hidden" name="id" value={item.id} />}
    <FormSection title="Identificação">
      <label className="grid gap-2 text-sm font-bold sm:col-span-2">Nome completo *<input className="field" name="name" required defaultValue={item?.name} /></label>
      <label className="grid gap-2 text-sm font-bold">Nome reduzido<input className="field" name="shortName" maxLength={80} defaultValue={item?.shortName ?? ""} placeholder="Ex.: RM, USG" /></label>
      <label className="grid gap-2 text-sm font-bold">Código TUSS<input className="field" name="manualTussCode" defaultValue={item?.tussCode ?? ""} /></label>
      <div className="sm:col-span-2"><TussAutocomplete table="22" label="Buscar na TUSS (opcional)" defaultCode={item?.tussCode ?? ""} defaultName={item?.tussName ?? ""} onSelectNameField="name" onSelectCodeField="manualTussCode" /></div>
    </FormSection>
    <FormSection title="Classificação"><ReferenceSelect kind="service_category" name="categoryId" label="Categoria" records={categories} defaultValue={item?.categoryId ?? ""} emptyLabel="Sem categoria" /></FormSection>
    <FormSection title="Duração e valores">
      <label className="grid gap-2 text-sm font-bold">Duração em minutos *<input className="field" name="durationMinutes" type="number" min="5" step="5" required defaultValue={item?.durationMinutes} /></label>
      <label className="grid gap-2 text-sm font-bold">Preço (R$)<input className="field" name="price" inputMode="decimal" defaultValue={money(item?.priceInCents)} placeholder="0,00" /></label>
      <label className="grid gap-2 text-sm font-bold">Custo estimado (R$)<input className="field" name="estimatedCost" inputMode="decimal" defaultValue={money(item?.estimatedCostInCents)} placeholder="Produtos, taxas etc." /></label>
      <ServiceDepositFields type={item?.depositType} value={item?.depositValue} />
    </FormSection>
    <FormSection title="Informações adicionais">
      <label className="grid gap-2 text-sm font-bold sm:col-span-2">Descrição<textarea className="field min-h-24" name="description" defaultValue={item?.description ?? ""} /></label>
      <label className="grid gap-2 text-sm font-bold sm:col-span-2">Preparação necessária<textarea className="field min-h-24" name="preparation" defaultValue={item?.preparation ?? ""} /></label>
      <div className="min-w-0 sm:col-span-2"><ServiceReturnFields settings={item} /></div>
      <div className="min-w-0 sm:col-span-2"><EntityImageField currentUrl={item?.imageUrl} label={`Imagem do ${label.toLowerCase()}`} /></div>
      <ServiceRepeatPolicy value={item?.publicRepeatPolicy} />
      {item && <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="isActive" defaultChecked={item.isActive} />Ativo</label>}
    </FormSection>
    <FormActions editing={Boolean(item)} />
  </ActionForm>;
}
