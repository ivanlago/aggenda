"use client";

import { useState } from "react";

import { StockMovementList, type StockMovementRow } from "./stock-movement-list";
import { StockProductList, type StockProductRow } from "./stock-product-list";

export function InventoryTabs({ products, movements, categories, subcategories, canManage }: {
  products: StockProductRow[];
  movements: StockMovementRow[];
  categories: Array<{ id: string; name: string }>;
  subcategories: Array<{ id: string; categoryId: string; name: string }>;
  canManage: boolean;
}) {
  const [tab, setTab] = useState<"sale" | "consumption" | "movements">("sale");

  return <div className="mt-5">
    <div className="mb-4 flex gap-2 border-b" role="tablist" aria-label="Dados do estoque">
      <button className={`px-4 py-3 text-sm font-bold ${tab === "sale" ? "border-b-2 border-brand text-brand" : "text-muted"}`} type="button" role="tab" aria-selected={tab === "sale"} onClick={() => setTab("sale")}>Estoque Venda</button>
      <button className={`px-4 py-3 text-sm font-bold ${tab === "consumption" ? "border-b-2 border-brand text-brand" : "text-muted"}`} type="button" role="tab" aria-selected={tab === "consumption"} onClick={() => setTab("consumption")}>Estoque consumo</button>
      <button className={`px-4 py-3 text-sm font-bold ${tab === "movements" ? "border-b-2 border-brand text-brand" : "text-muted"}`} type="button" role="tab" aria-selected={tab === "movements"} onClick={() => setTab("movements")}>Movimentações</button>
    </div>
    {tab === "sale" && <StockProductList mode="sale" products={products} categories={categories} subcategories={subcategories} canManage={canManage} />}
    {tab === "consumption" && <StockProductList mode="consumption" products={products} categories={categories} subcategories={subcategories} canManage={canManage} />}
    {tab === "movements" && <StockMovementList movements={movements} />}
  </div>;
}
