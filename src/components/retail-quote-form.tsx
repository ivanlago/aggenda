"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { saveRetailQuote } from "@/actions/retail-quotes";
import { ActionForm } from "@/components/action-form";
import { PosCatalog, type CatalogItem } from "@/components/pos-catalog";

const money = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
type Item = { variantId: string; quantity: number; discountInCents: number };

export function RetailQuoteForm({ catalog, clients, attendanceId, initialClientId, canDiscount, defaultValidity }: {
  catalog: CatalogItem[]; clients: { id: string; name: string }[]; attendanceId?: string; initialClientId?: string; canDiscount: boolean; defaultValidity: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [id, setId] = useState("");
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const subtotal = items.reduce((sum, item) => sum + (catalog.find((entry) => entry.id === item.variantId)?.priceInCents ?? 0) * item.quantity, 0);
  const discount = items.reduce((sum, item) => sum + item.discountInCents, 0);
  function addItem(variantId: string) {
    if (!id) setId(crypto.randomUUID());
    setItems((current) => {
      const existing = current.find((item) => item.variantId === variantId);
      const limit = catalog.find((item) => item.id === variantId)?.kind === "package" ? 100 : 10000;
      return existing ? current.map((item) => item.variantId === variantId ? { ...item, quantity: Math.min(limit, item.quantity + 1) } : item) : current.length < 50 ? [...current, { variantId, quantity: 1, discountInCents: 0 }] : current;
    });
  }
  return <ActionForm action={saveRetailQuote} successMessage="Orçamento salvo. Disponível em Venda e orçamento." onSuccess={() => { setItems([]); setId(""); }} className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr] xl:items-start">
    <input type="hidden" name="id" value={id} />
    <input type="hidden" name="items" value={JSON.stringify(items)} />
    {attendanceId && <input type="hidden" name="attendanceId" value={attendanceId} />}
    <PosCatalog variants={catalog} cart={items} addToCart={addItem} quoteMode />
    <section className="panel form-stack xl:sticky xl:top-5">
      <h3 className="text-lg font-extrabold">Itens do orçamento</h3>
      <div className="divide-y">{items.map((item) => {
        const entry = catalog.find((variant) => variant.id === item.variantId)!;
        return <div key={item.variantId} className="grid items-center gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_100px_130px_auto]">
          <div><p className="font-bold">{entry.label}</p><p className="text-sm text-muted">{money(entry.priceInCents)} por unidade</p></div>
          <label className="grid gap-1 text-xs font-bold">Quantidade<input className="field" type="number" min={1} max={entry.kind === "package" ? 100 : 10000} required value={item.quantity} onChange={(event) => { const quantity = Math.max(1, Math.min(entry.kind === "package" ? 100 : 10000, Number(event.target.value) || 1)); setItems((current) => current.map((line) => line.variantId === item.variantId ? { ...line, quantity, discountInCents: Math.min(line.discountInCents, quantity * entry.priceInCents) } : line)); }} /></label>
          <strong>{money(entry.priceInCents * item.quantity - item.discountInCents)}</strong>
          <button className="icon-button text-red-700" type="button" aria-label={`Remover ${entry.label}`} onClick={() => setItems((current) => current.filter((line) => line.variantId !== item.variantId))}><Trash2 className="size-4" /></button>
          {canDiscount && <label className="grid gap-1 text-xs font-bold sm:col-span-4">Desconto do item (R$)<input className="field max-w-40" inputMode="decimal" value={(item.discountInCents / 100).toFixed(2).replace(".", ",")} onChange={(event) => { const amount = Math.max(0, Math.min(entry.priceInCents * item.quantity, Math.round((Number(event.target.value.replace(",", ".")) || 0) * 100))); setItems((current) => current.map((line) => line.variantId === item.variantId ? { ...line, discountInCents: amount } : line)); }} /></label>}
        </div>;
      })}{!items.length && <p className="py-5 text-sm text-muted">Adicione produtos, procedimentos ou pacotes acima.</p>}</div>
      {attendanceId ? <input type="hidden" name="clientId" value={clientId} /> : <label className="grid gap-1 text-sm font-bold">Cliente (opcional)<select className="field" name="clientId" value={clientId} onChange={(event) => setClientId(event.target.value)}><option value="">Orçamento sem cliente identificado</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>}
      <label className="grid gap-1 text-sm font-bold">Validade<input className="field sm:max-w-64" type="date" name="validUntil" defaultValue={defaultValidity} required /></label>
      <label className="grid gap-1 text-sm font-bold">Condições e observações<textarea className="field min-h-20" name="notes" maxLength={3000} placeholder="Condições comerciais e informações adicionais" /></label>
      <div className="rounded-xl bg-brand/5 p-4"><p className="text-sm">Subtotal: {money(subtotal)} · Desconto: {money(discount)}</p><p className="mt-2 text-xl font-extrabold text-brand">Total: {money(subtotal - discount)}</p></div>
      <button className="primary-button w-fit" disabled={!items.length}>Salvar e abrir orçamento em PDF</button>
    </section>
  </ActionForm>;
}
