"use client";

import { ArrowLeftRight, X } from "lucide-react";
import { useMemo, useState } from "react";

import { moveInventory } from "@/actions/inventory";
import { ActionForm } from "@/components/action-form";

export function StockMovementForm({ products }: { products: Array<{ id: string; name: string; balance: string }> }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("entry");
  const [query, setQuery] = useState("");
  const filteredProducts = useMemo(() => products.filter((item) => item.name.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR"))), [products, query]);
  return <><button className="secondary-button" type="button" onClick={() => setOpen(true)}><ArrowLeftRight className="mr-2 inline size-4" />Movimentação</button>{open && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label="Movimentação de estoque"><div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl"><div className="flex justify-between"><h2 className="text-xl font-extrabold">Movimentação de estoque</h2><button className="icon-button" type="button" onClick={() => setOpen(false)}><X className="size-5" /></button></div><ActionForm action={moveInventory} successMessage="Movimentação registrada." className="mt-5 grid gap-3" onSuccess={() => setOpen(false)}><label className="grid gap-1 text-sm font-bold">Operação<select className="field" name="type" required value={type} onChange={(event) => setType(event.target.value)}><option value="entry">Entrada</option><option value="exit">Saída</option><option value="consumption">Retirada p/ consumo</option></select></label><label className="grid gap-1 text-sm font-bold">Buscar por nome do produto<input className="field" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Digite o nome do produto" /></label><label className="grid gap-1 text-sm font-bold">Produto<select className="field" name="productId" required defaultValue=""><option value="" disabled>Selecione o produto</option>{filteredProducts.map((item) => <option key={item.id} value={item.id}>{item.name} · saldo {item.balance}</option>)}</select></label><label className="grid gap-1 text-sm font-bold">Quantidade<input className="field" name="quantity" inputMode="decimal" required /></label>{type !== "consumption" && <label className="grid gap-1 text-sm font-bold">Motivo<input className="field" name="notes" required placeholder={type === "entry" ? "Ex.: Compra de mercadorias" : "Ex.: Ajuste após inventário"} /></label>}<button className="primary-button">Registrar movimentação</button></ActionForm></div></div>}</>;
}
