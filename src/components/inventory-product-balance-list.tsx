"use client";

import { Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

type ProductBalance = {
  id: string;
  name: string;
  sku: string | null;
  unitLabel: string;
  balanceLabel: string;
  minimumLabel: string;
  needsRestock: boolean;
};

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

export function InventoryProductBalanceList({ products }: { products: ProductBalance[] }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const filteredProducts = useMemo(() => {
    const normalizedQuery = normalize(deferredQuery.trim());
    if (!normalizedQuery) return products;
    return products.filter((product) => normalize(`${product.name} ${product.sku ?? ""}`).includes(normalizedQuery));
  }, [deferredQuery, products]);

  return (
    <section className="panel mt-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-lg font-extrabold">Produtos e saldos disponíveis</h2><p className="text-sm text-muted">Consulte o saldo atual pelo nome ou SKU.</p></div>
        <label className="relative block w-full sm:max-w-sm">
          <span className="sr-only">Buscar produto</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input className="field w-full pl-9" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produto ou SKU" />
        </label>
      </div>
      <div className="mt-4 divide-y">
        {filteredProducts.map((product) => (
          <article className="flex flex-wrap items-center justify-between gap-3 py-4" key={product.id}>
            <div>
              <div className="flex flex-wrap items-center gap-2"><p className="font-extrabold">{product.name}</p>{product.needsRestock && <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">Reposição necessária</span>}</div>
              <p className="text-xs text-muted">{product.sku || "Sem SKU"} · mínimo {product.minimumLabel} {product.unitLabel}</p>
            </div>
            <div className="text-right"><p className="text-xl font-extrabold text-brand">{product.balanceLabel} {product.unitLabel}</p><p className="text-xs text-muted">saldo disponível</p></div>
          </article>
        ))}
        {filteredProducts.length === 0 && <p className="py-8 text-center text-sm text-muted">Nenhum produto encontrado.</p>}
      </div>
    </section>
  );
}
