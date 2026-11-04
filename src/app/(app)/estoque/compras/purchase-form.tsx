"use client";

import { useRef, useState } from "react";
import { registerInventoryPurchase } from "@/actions/inventory-purchases";
import { ActionForm } from "@/components/action-form";

type Product = { id: string; name: string; lotTracking: boolean; unit: string };
type Item = { id: number; productId: string };

export function PurchaseForm({ suppliers, products, today }: {
  suppliers: { id: string; name: string }[];
  products: Product[];
  today: string;
}) {
  const [items, setItems] = useState<Item[]>([{ id: 1, productId: "" }]);
  const nextId = useRef(2);
  const requestId = useRef<string | null>(null);

  return <ActionForm action={async data => {
    requestId.current ??= crypto.randomUUID();
    data.set("requestId", requestId.current);
    return registerInventoryPurchase(data);
  }} successMessage="Compra registrada e estoque atualizado." onSuccess={() => {
    requestId.current = null;
    setItems([{ id: nextId.current++, productId: "" }]);
  }} className="grid gap-4">
    <div className="grid gap-3 md:grid-cols-3">
      <label className="grid gap-1 text-sm font-bold">Fornecedor
        <select className="field" name="supplierId" required>
          <option value="">Selecione</option>
          {suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-bold">Data da compra<input className="field" type="date" name="purchasedOn" defaultValue={today} required /></label>
      <label className="grid gap-1 text-sm font-bold">Nota ou referência<input className="field" name="reference" maxLength={120} /></label>
    </div>
    {items.map((item, index) => {
      const product = products.find(option => option.id === item.productId);
      return <fieldset key={item.id} className="grid gap-3 rounded-xl border p-3 md:grid-cols-3">
        <legend className="px-1 text-sm font-extrabold">Item {index + 1}</legend>
        <label className="grid gap-1 text-sm font-bold">Produto
          <select className="field" name="productId" required value={item.productId} onChange={event => {
            const productId = event.target.value;
            setItems(current => current.map(row => row.id === item.id ? { ...row, productId } : row));
          }}>
            <option value="">Selecione</option>
            {products.map(option => <option value={option.id} key={option.id}>{option.name}{option.lotTracking ? " · por lote" : ""}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-bold">Quantidade{product && " (" + product.unit + ")"}
          <input className="field" name="quantity" inputMode="decimal" required />
        </label>
        <label className="grid gap-1 text-sm font-bold">Custo unitário (R$)<input className="field" name="unitCost" inputMode="decimal" required /></label>
        <label className="grid gap-1 text-sm font-bold">Destino
          <select className="field" name="pool"><option value="sale">Venda</option><option value="consumption">Consumo</option></select>
        </label>
        <label className="grid gap-1 text-sm font-bold">Número do lote
          <input className="field" name="code" maxLength={100} required={product?.lotTracking} />
        </label>
        <label className="grid gap-1 text-sm font-bold">Validade do lote
          <input className="field" name="expiresOn" type="date" required={product?.lotTracking} />
        </label>
        {items.length > 1 && <div><button type="button" className="secondary-button" onClick={() => setItems(current => current.filter(row => row.id !== item.id))}>Remover item</button></div>}
      </fieldset>;
    })}
    <div className="flex flex-wrap gap-2">
      <button type="button" className="secondary-button" disabled={items.length >= 30} onClick={() => {
        const id = nextId.current++;
        setItems(current => [...current, { id, productId: "" }]);
      }}>Adicionar item</button>
      <button className="primary-button">Registrar compra e dar entrada</button>
    </div>
  </ActionForm>;
}
