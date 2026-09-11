"use client";

import { Plus, ScanBarcode, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

export type CatalogItem = { id: string; label: string; barcode: string | null; priceInCents: number; stock: number; kind?: "product" | "service" | "package"; unavailableReason?: string };
const currency = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

export function PosCatalog({ variants, cart, addToCart, quoteMode = false }: { variants: CatalogItem[]; cart: { variantId: string; quantity: number }[]; addToCart: (id: string) => void; quoteMode?: boolean }) {
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState("");
  const [barcodeMessage, setBarcodeMessage] = useState("");
  const deferredQuery = useDeferredValue(query);
  const description = quoteMode ? "Selecione os itens para compor o orçamento." : "Monte o carrinho com os itens desejados. Pacotes exigem cliente identificado e pagamento recebido.";
  const visibleVariants = useMemo(() => {
    const normalizedQuery = normalize(deferredQuery.trim());
    return variants.filter((item) => (category === "all" || (item.kind ?? "product") === category) && (!normalizedQuery || normalize(item.label).includes(normalizedQuery)));
  }, [deferredQuery, variants, category]);
  const readBarcode = () => {
    const code = barcode.trim();
    const variant = variants.find((item) => item.barcode === code);
    if (!variant) { setBarcodeMessage("Código não encontrado."); return; }
    addToCart(variant.id); setBarcode(""); setBarcodeMessage(`${variant.label} adicionado.`);
  };
  return (      <section className="panel form-stack">
        <div><h2 className="text-lg font-extrabold">Produtos, procedimentos e pacotes</h2><p className="text-sm text-muted">{description}</p></div>
        <label className="grid gap-1 text-sm font-bold">Categoria<select className="field" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Todos os itens</option><option value="product">Produtos</option><option value="service">Procedimentos</option><option value="package">Pacotes</option></select></label>
        <div className="grid gap-2 sm:grid-cols-2"><label className="relative block"><span className="sr-only">Buscar item</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input className="field w-full pl-9" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar item" /></label><label className="relative block"><span className="sr-only">Ler código de barras</span><ScanBarcode className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input className="field w-full pl-9" value={barcode} onChange={(event) => setBarcode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); readBarcode(); } }} placeholder="Leia o código e pressione Enter" /></label></div>{barcodeMessage && <p className="text-xs font-bold text-brand" role="status">{barcodeMessage}</p>}
        <div className="grid max-h-[560px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {visibleVariants.map((variant) => {
            const inCart = cart.find((item) => item.variantId === variant.id)?.quantity ?? 0;
            return <article className="flex flex-col justify-between gap-3 rounded-2xl border bg-slate-50/60 p-4" key={variant.id}><div><p className="font-extrabold">{variant.label}</p><p className="mt-1 text-sm font-bold text-brand">{currency(variant.priceInCents)}</p><p className="text-xs text-muted">{variant.barcode ? `Código ${variant.barcode} · ` : "Sem código · "}{variant.kind === "service" ? "Procedimento" : variant.kind === "package" ? "Pacote" : `${variant.stock} em estoque`}{inCart ? ` · ${inCart} selecionados` : ""}</p>{variant.unavailableReason && <p className="mt-2 text-xs font-bold text-amber-700">{variant.unavailableReason}</p>}</div><button className="secondary-button justify-center" type="button" disabled={inCart >= (quoteMode ? (variant.kind === "package" ? 100 : 10000) : variant.stock) || Boolean(variant.unavailableReason)} title={variant.unavailableReason} onClick={() => addToCart(variant.id)}><Plus className="size-4" /> {inCart ? "Adicionar mais" : "Adicionar"}</button></article>;
          })}
          {visibleVariants.length === 0 && <p className="py-8 text-center text-sm text-muted sm:col-span-2">Nenhum item disponível.</p>}
        </div>
      </section>
  );
}
