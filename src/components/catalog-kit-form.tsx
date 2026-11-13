"use client";

import { ItemCommissionField } from "@/components/item-commission-field";
import { useState } from "react";
import { saveCatalogKit } from "@/actions/catalog-kits";
import { ActionForm } from "@/components/action-form";
import { ModalShell } from "@/components/modal-shell";

export type KitChoice = { id: string; type: "product" | "service"; name: string };
export type KitRecord = { id: string; name: string; description: string | null; priceInCents: number; commissionRateBasisPoints?: number; isActive: boolean; items: (KitChoice & { quantity: number })[] };

function KitForm({ choices, kit }: { choices: KitChoice[]; kit?: KitRecord }) {
  const [items, setItems] = useState(kit?.items ?? []);
  const [search, setSearch] = useState("");
  const available = choices.filter(choice => choice.type === "product" && !items.some(item => item.type === choice.type && item.id === choice.id) && choice.name.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  return <ActionForm action={saveCatalogKit} successMessage="Kit salvo." resetOnSuccess={false} className="grid gap-4">
    {kit && <input type="hidden" name="id" value={kit.id} />}
    {items.some(item=>item.type!=="product")&&<p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Este kit antigo contém serviços. Remova-os e revise o preço antes de salvar. A composição anterior permanece no histórico das vendas.</p>}
    <input type="hidden" name="items" value={JSON.stringify(items)} />
    <label className="grid gap-2 text-sm font-bold">Nome do kit *<input className="field" name="name" minLength={2} maxLength={120} defaultValue={kit?.name} required /></label>
    <label className="grid gap-2 text-sm font-bold">Descrição<textarea className="field" name="description" maxLength={2000} defaultValue={kit?.description ?? ""} /></label>
    <div className="grid min-w-0 items-start gap-4 sm:grid-cols-3">
    <label className="grid gap-2 text-sm font-bold">Preço de venda (R$) *<input className="field" name="price" inputMode="decimal" defaultValue={kit ? (kit.priceInCents / 100).toFixed(2).replace(".", ",") : ""} required /></label>
      <ItemCommissionField value={kit?.commissionRateBasisPoints} />
    <label className="flex min-h-12 items-center gap-2 text-sm font-bold sm:mt-6"><input type="checkbox" name="isActive" defaultChecked={kit?.isActive ?? true} />Kit ativo</label>
    </div>
    <label className="grid gap-2 text-sm font-bold">Adicionar produto<input className="field" type="search" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} placeholder="Buscar pelo nome" /></label>
    <div className="grid max-h-48 gap-2 overflow-auto rounded-xl border p-3">
      {available.slice(0, 30).map(choice => <button key={`${choice.type}:${choice.id}`} className="secondary-button justify-between" type="button" onClick={() => setItems(current => [...current, { ...choice, quantity: 1 }])}>{choice.name}<span className="text-xs text-muted">{choice.type === "product" ? "Produto" : "Serviço"} · Adicionar</span></button>)}
      {!available.length && <p className="text-sm text-muted">Nenhum item disponível para esta busca.</p>}
      {available.length > 30 && <p className="text-sm text-muted">Refine a busca para encontrar outros itens.</p>}
    </div>
    <h3 className="font-extrabold">Composição do kit *</h3>
    {!items.length && <p className="text-sm text-muted">Adicione pelo menos um produto.</p>}
    {items.map((item, index) => <div className="flex flex-wrap items-center gap-3 rounded-xl border p-3" key={`${item.type}:${item.id}`}>
      <span className="min-w-0 flex-1 text-sm font-bold">{item.name} · {item.type === "product" ? "Produto" : "Serviço"}</span>
      <label className="grid gap-1 text-xs font-bold">Quantidade<input className="field w-24" type="number" min={1} max={10000} step={1} required value={item.quantity} onChange={event => setItems(current => current.map((line, position) => position === index ? { ...line, quantity: Number(event.target.value) } : line))} /></label>
      <button className="secondary-button" type="button" aria-label={`Remover ${item.name}`} onClick={() => setItems(current => current.filter((_, position) => position !== index))}>Remover</button>
    </div>)}
    <button className="primary-button" disabled={!items.length}>Salvar kit</button>
  </ActionForm>;
}

export function CatalogKitDialog({ choices, kit }: { choices: KitChoice[]; kit?: KitRecord }) {
  return <ModalShell title={kit ? `Editar kit: ${kit.name}` : "Novo kit de produtos"} variant={kit ? "edit" : "new"} wide closeOnSuccess><KitForm choices={choices} kit={kit} /></ModalShell>;
}
