"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { createService, updateService } from "@/actions/app";
import { ActionForm } from "@/components/action-form";
import { CatalogImageField } from "@/components/catalog-image-field";
import { FormActions } from "@/components/form-dialog-context";
import { ReferenceSelect } from "@/components/reference-records";
import { ServiceDepositFields } from "@/components/service-deposit-fields";
import { ServiceReturnFields } from "@/components/service-return-fields";
import { ServiceRepeatPolicy } from "@/components/service-repeat-policy";
import { TussAutocomplete } from "@/components/tuss-autocomplete";
import type { services } from "@/db/schema";
import type { ReferenceRecord } from "@/lib/reference-records";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function readAmount(value: string) {
  const raw = value.replace(/\s/g, "");
  if (!raw) return null;
  const amount = Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

export function ServiceForm({ item, label, categories }: { item?: typeof services.$inferSelect; label: string; categories: ReferenceRecord[] }) {
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const additionalId = useId();
  const money = (cents: number | null | undefined) => cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",");
  const [price, setPrice] = useState(money(item?.priceInCents));
  const [cost, setCost] = useState(money(item?.estimatedCostInCents));
  const priceCents = readAmount(price);
  const costCents = readAmount(cost);
  const contribution = priceCents !== null && costCents !== null ? priceCents - costCents : null;
  return <ActionForm action={item ? updateService : createService} successMessage={item ? "Serviço atualizado." : "Serviço cadastrado."} resetOnSuccess={false} className="grid min-w-0 gap-5 sm:grid-cols-2">
    {item && <input type="hidden" name="id" value={item.id} />}
    <div className="col-span-full grid min-w-0 gap-4 sm:grid-cols-2">
      <div className="col-span-full grid min-w-0 items-start gap-5 sm:grid-cols-[176px_minmax(0,1fr)]">
        <CatalogImageField currentUrl={item?.imageUrl} label={`Imagem do ${label.toLowerCase()}`} />
        <div className="grid min-w-0 gap-4">
          <div className="min-w-0"><TussAutocomplete table="22" label="Buscar na TUSS (opcional)" defaultCode={item?.tussCode ?? ""} defaultName={item?.tussName ?? ""} onSelectNameField="name" onSelectCodeField="manualTussCode" /></div>
          <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <label className="grid gap-2 text-sm font-bold">Código TUSS<input className="field" name="manualTussCode" defaultValue={item?.tussCode ?? ""} /></label>
            <label className="grid gap-2 text-sm font-bold">Nome *<input className="field" name="name" minLength={2} maxLength={80} required defaultValue={item?.shortName || item?.name || ""} placeholder="Ex.: RM, USG" /></label>
          </div>
        </div>
      </div>
    </div>
    <div className="col-span-full grid min-w-0 gap-4 sm:grid-cols-2">
      <ReferenceSelect kind="service_category" name="categoryId" label="Categoria" records={categories} defaultValue={item?.categoryId ?? ""} emptyLabel="Sem categoria" />
      <label className="grid gap-2 text-sm font-bold">Duração em minutos *<input className="field" name="durationMinutes" type="number" min="5" step="5" required defaultValue={item?.durationMinutes} /></label>
    </div>
    <div className="col-span-full grid min-w-0 gap-4 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-bold">Custo estimado (R$)<input className="field" name="estimatedCost" inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="Produtos, taxas etc." /></label>
      <label className="grid gap-2 text-sm font-bold">Preço (R$)<input className="field" name="price" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0,00" /></label>
      {contribution !== null && <p className="rounded-lg bg-brand/5 p-3 text-sm sm:col-span-2">
        Margem estimada por atendimento: <strong>{currency.format(contribution / 100)}</strong>. Considera apenas o custo informado.
      </p>}
      <label className="flex items-start gap-2 text-sm font-bold sm:col-span-2">
        <input type="checkbox" name="hidePublicPrice" defaultChecked={item?.hidePublicPrice} />
        Ocultar o preço na lista de serviços do portal. Cobranças e sinais continuam mostrando o valor devido.
      </label>
      <ServiceDepositFields type={item?.depositType} value={item?.depositValue} />
    </div>
    <button type="button" className="secondary-button col-span-full w-fit" aria-expanded={additionalOpen} aria-controls={additionalId} onClick={() => setAdditionalOpen(open => !open)}>
      Descrição e preparação<ChevronDown aria-hidden="true" className={`size-4 transition-transform ${additionalOpen ? "rotate-180" : ""}`} />
    </button>
    <div id={additionalId} className="col-span-full" hidden={!additionalOpen}>
    <div className="col-span-full grid min-w-0 gap-4 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-bold sm:col-span-2">Descrição<textarea className="field min-h-24" name="description" defaultValue={item?.description ?? ""} /></label>
      <label className="grid gap-2 text-sm font-bold sm:col-span-2">Preparação necessária<textarea className="field min-h-24" name="preparation" defaultValue={item?.preparation ?? ""} /></label>
    </div>
    </div>
      <div className="min-w-0 sm:col-span-2"><ServiceReturnFields settings={item} /></div>
      <ServiceRepeatPolicy value={item?.publicRepeatPolicy} />
      {item && <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="isActive" defaultChecked={item.isActive} />Ativo</label>}
    <p className="col-span-full text-sm text-muted">Campos com * são obrigatórios.</p>
    <FormActions editing={Boolean(item)} />
  </ActionForm>;
}
