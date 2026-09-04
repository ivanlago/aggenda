"use client";

import { Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import type { StockProductRow } from "./stock-product-list";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

export function ConsumptionProductList({ products, categories, subcategories }: {
  products: StockProductRow[];
  categories: Array<{ id: string; name: string }>;
  subcategories: Array<{ id: string; categoryId: string; name: string }>;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const filteredSubcategories = subcategories.filter((item) => item.categoryId === categoryId);
  const filtered = useMemo(() => products.filter((item) =>
    item.consumptionQuantity > 0 &&
    normalize(item.name).includes(normalize(deferredQuery)) &&
    (!categoryId || item.categoryId === categoryId) &&
    (!subcategoryId || item.subcategoryId === subcategoryId)
  ), [products, deferredQuery, categoryId, subcategoryId]);

  return <section className="panel mt-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-lg font-extrabold">Produtos em consumo</h2><p className="text-sm text-muted">Produtos retirados do estoque para utilização interna.</p></div>
      <label className="relative w-full sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input className="field w-full pl-9" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome do produto" /></label>
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      <select className="field" value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setSubcategoryId(""); }}><option value="">Todas as categorias</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select className="field" value={subcategoryId} onChange={(event) => setSubcategoryId(event.target.value)} disabled={!categoryId}><option value="">Todas as subcategorias</option>{filteredSubcategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
    </div>
    <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="border-b text-xs uppercase text-muted"><tr><th className="p-3">Produto</th><th className="p-3">Apresentação</th><th className="p-3">Marca</th><th className="p-3 text-right">Qtd.</th><th className="p-3 text-right">Custo unit.</th><th className="p-3 text-right">Custo total</th><th className="p-3 text-right">Venda unit.</th><th className="p-3 text-right">Venda total</th></tr></thead><tbody className="divide-y">{filtered.map((item) => <tr key={item.id}><td className="p-3"><strong>{item.name}</strong><p className="text-xs text-muted">{[item.category, item.subcategory].filter(Boolean).join(" · ") || "Sem categoria"}</p></td><td className="p-3">{item.presentation}</td><td className="p-3">{item.brand}</td><td className="p-3 text-right font-bold">{item.consumptionQuantityLabel}</td><td className="p-3 text-right">{item.costUnit}</td><td className="p-3 text-right">{item.consumptionCostTotal}</td><td className="p-3 text-right">{item.saleUnit}</td><td className="p-3 text-right font-bold text-brand">{item.consumptionSaleTotal}</td></tr>)}</tbody></table>{!filtered.length && <p className="py-8 text-center text-sm text-muted">Nenhum produto foi retirado para consumo.</p>}</div>
  </section>;
}
