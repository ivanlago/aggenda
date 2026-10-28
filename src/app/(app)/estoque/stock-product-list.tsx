"use client";

import { PaginatedCollection } from "@/components/paginated-collection";


import { Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { ProductEditButton } from "./stock-product-form";
import { EntityThumbnail } from "@/components/entity-image-field";

export type StockProductRow = {
  id: string;
  variantId: string;
  name: string;
  imageUrl: string | null;
  presentation: string;
  rawPresentation: string;
  brand: string;
  rawBrand: string;
  sku: string;
  barcode: string;
  unit: string;
  description: string;
  costValue: string;
  saleValue: string;
  minimumValue: string;
  quantity: number;
  quantityLabel: string;
  availableSaleLabel: string;
  availableConsumptionLabel: string;
  availableSale: number;
  availableConsumption: number;
  consumptionQuantity: number;
  consumptionQuantityLabel: string;
  costUnit: string;
  costTotal: string;
  consumptionCostTotal: string;
  saleUnit: string;
  saleTotal: string;
  consumptionSaleTotal: string;
  minimum: number;
  categoryId: string | null;
  category: string;
  subcategoryId: string | null;
  subcategory: string;
  hasConsumption: boolean;
  isForSale: boolean;
};
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function StockProductList({
  mode,
  products,
  categories,
  subcategories,
  canManage,
}: {
  mode: "sale" | "consumption";
  products: StockProductRow[];
  categories: Array<{ id: string; name: string }>;
  subcategories: Array<{ id: string; categoryId: string; name: string }>;
  canManage: boolean;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState("all");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const isConsumption = mode === "consumption";
  const filteredSubcategories = subcategories.filter(
    (item) => item.categoryId === categoryId,
  );
  const filtered = useMemo(
    () =>
      products.filter((item) => {
        const belongsToStock = mode === "sale" ? item.quantity > 0 || item.isForSale : item.consumptionQuantity > 0 || !item.isForSale;
        const matchesQuery = normalize(item.name).includes(
          normalize(deferredQuery),
        );
        const matchesStatus =
          status === "all" ||
          (status === "stock" && (isConsumption ? item.availableConsumption : item.availableSale) > 0) ||
          (status === "low" && (isConsumption ? item.consumptionQuantity : item.quantity) <= item.minimum);
        return (
          belongsToStock && matchesQuery &&
          matchesStatus &&
          (!categoryId || item.categoryId === categoryId) &&
          (!subcategoryId || item.subcategoryId === subcategoryId)
        );
      }),
    [products, deferredQuery, status, categoryId, subcategoryId, mode, isConsumption],
  );
  return (
    <section className="panel mt-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">{isConsumption ? "Estoque consumo" : "Estoque Venda"}</h2>
          <p className="text-sm text-muted">
            Consulte saldos, custos e valores de venda.
          </p>
        </div>
        <label className="relative w-full sm:max-w-sm"><span className="sr-only">Buscar produto</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            className="field w-full pl-9"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome do produto"
          />
        </label>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <label className="grid gap-1 text-sm font-bold">Situação do estoque<select
          className="field"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">Todos no estoque</option>
          <option value="stock">Com saldo disponível</option>
          <option value="low">Abaixo do estoque mínimo</option>
        </select></label>
        <label className="grid gap-1 text-sm font-bold">Categoria<select
          className="field"
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value);
            setSubcategoryId("");
          }}
        >
          <option value="">Todas as categorias</option>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select></label>
        <label className="grid gap-1 text-sm font-bold">Subcategoria<select
          className="field"
          value={subcategoryId}
          onChange={(event) => setSubcategoryId(event.target.value)}
          disabled={!categoryId}
        >
          <option value="">Todas as subcategorias</option>
          {filteredSubcategories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select></label>
      </div>
      <div className="mt-4 overflow-x-auto max-h-[40rem] overflow-y-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="border-b text-xs uppercase text-muted">
            <tr>
              <th className="p-3">Produto</th>
              <th className="p-3">Apresentação</th>
              <th className="p-3">Marca</th>
              <th className="p-3 text-right">Qtd.</th>
              <th className="p-3 text-right">Custo unit.</th>
              <th className="p-3 text-right">Custo total</th>
              <th className="p-3 text-right">Venda unit.</th>
              <th className="p-3 text-right">Venda total</th>
              {canManage && (
                <th className="relative p-3">
                  <span className="sr-only">Ações</span>
                </th>
              )}
            </tr>
          </thead>
          <PaginatedCollection as="tbody" pageSize={20} label="Registros" className="divide-y">
            {filtered.map((item) => (
              <tr key={item.id}>
                <td className="p-3">
                  <div className="flex items-center gap-3"><EntityThumbnail src={item.imageUrl} alt={item.name} fallback={item.name[0]} /><div><strong>{item.name}</strong><p className="text-xs text-muted">{[item.category, item.subcategory].filter(Boolean).join(" · ") || "Sem categoria"}</p></div></div>
                </td>
                <td className="p-3">{item.presentation}</td>
                <td className="p-3">{item.brand}</td>
                <td
                  className={`p-3 text-right font-bold ${(isConsumption ? item.consumptionQuantity : item.quantity) <= item.minimum ? "text-red-700" : ""}`}
                >
                  {isConsumption ? item.consumptionQuantityLabel : item.quantityLabel}
                  <p className="text-xs font-normal text-muted">Disponível: {isConsumption ? item.availableConsumptionLabel : item.availableSaleLabel}</p>
                </td>
                <td className="p-3 text-right">{item.costUnit}</td>
                <td className="p-3 text-right">{isConsumption ? item.consumptionCostTotal : item.costTotal}</td>
                <td className="p-3 text-right">{item.saleUnit}</td>
                <td className="p-3 text-right font-bold text-brand">
                  {isConsumption ? item.consumptionSaleTotal : item.saleTotal}
                </td>
                {canManage && (
                  <td className="p-3">
                    <ProductEditButton
                      product={item}
                      categories={categories}
                      subcategories={subcategories}
                    />
                  </td>
                )}
              </tr>
            ))}
          </PaginatedCollection>
        </table>
        {!filtered.length && (
          <p className="py-8 text-center text-sm text-muted">
            Nenhum produto encontrado para os filtros selecionados.
          </p>
        )}
      </div>
    </section>
  );
}
