"use client";

import { ScanBarcode } from "lucide-react";
import { useMemo, useState } from "react";

import { moveInventory } from "@/actions/inventory";
import { ActionForm } from "@/components/action-form";

type Product = { id: string; name: string; barcode: string | null; stockLabel: string };

export function InventoryEntryForm({ products }: { products: Product[] }) {
  const [productId, setProductId] = useState("");
  const [barcode, setBarcode] = useState("");
  const [message, setMessage] = useState("");
  const productsByBarcode = useMemo(() => new Map(products.filter((item) => item.barcode).map((item) => [item.barcode!, item])), [products]);
  const readBarcode = () => {
    const product = productsByBarcode.get(barcode.trim());
    if (!product) { setMessage("Código não encontrado."); return; }
    setProductId(product.id); setBarcode(""); setMessage(`${product.name} selecionado.`);
  };
  return <ActionForm action={moveInventory} successMessage="Estoque atualizado." className="panel form-stack"><h2 className="text-lg font-extrabold">Adicionar quantidade</h2><p className="text-sm text-muted">Selecione o produto ou use um leitor de código de barras.</p><input type="hidden" name="type" value="entry" /><label className="relative"><span className="sr-only">Ler código de barras</span><ScanBarcode className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input className="field w-full pl-9" value={barcode} onChange={(event) => setBarcode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); readBarcode(); } }} placeholder="Leia o código e pressione Enter" /></label>{message && <p className="text-xs font-bold text-brand" role="status">{message}</p>}<select className="field" name="productId" required value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">Selecione o produto</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name} · saldo {item.stockLabel}</option>)}</select><input className="field" name="quantity" inputMode="decimal" required placeholder="Quantidade adicionada" /><input className="field" name="notes" placeholder="Observação ou origem da entrada" /><button className="primary-button">Adicionar ao estoque</button></ActionForm>;
}
