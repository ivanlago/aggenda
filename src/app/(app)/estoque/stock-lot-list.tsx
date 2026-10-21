"use client";

import Link from "next/link";
import { useState } from "react";

export type StockLotRow = {
  id: string; code: string; expiresOn: string | null; status: string;
  sale: number; consumption: number; fallbackName: string; productName: string | null;
  presentation: string | null; brand: string | null; unit: string;
};

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
const quantity = (value: number) => (value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const statusOf = (lot: StockLotRow, today: string) => lot.status === "recalled" ? "Recolhido" : lot.expiresOn && lot.expiresOn < today ? "Vencido" : lot.status === "quarantine" ? "Quarentena" : "Disponível";
const colors: Record<string, string> = { Disponível: "bg-emerald-50 text-emerald-800", Vencido: "bg-red-50 text-red-800", Recolhido: "bg-slate-100 text-slate-700", Quarentena: "bg-amber-50 text-amber-800" };

export function StockLotList({ lots, today }: { lots: StockLotRow[]; today: string }) {
  const [code, setCode] = useState("");
  const [product, setProduct] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const filtered = lots.filter(lot => normalize(lot.code).includes(normalize(code))
    && normalize(`${lot.productName ?? lot.fallbackName} ${lot.presentation ?? ""} ${lot.brand ?? ""}`).includes(normalize(product))
    && (!from || !!lot.expiresOn && lot.expiresOn >= from)
    && (!until || !!lot.expiresOn && lot.expiresOn <= until));

  return <section className="panel">
    <h2 className="text-lg font-extrabold">Lotes</h2>
    <p className="text-sm text-muted">Ordenados pelo vencimento mais próximo. Quantidade total dos estoques de venda e consumo.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1 text-sm font-bold">Número do lote<input className="field" type="search" value={code} onChange={event => setCode(event.target.value)} placeholder="Buscar lote" /></label>
      <label className="grid gap-1 text-sm font-bold">Produto<input className="field" type="search" value={product} onChange={event => setProduct(event.target.value)} placeholder="Produto, apresentação ou marca" /></label>
      <label className="grid gap-1 text-sm font-bold">Vencimento de<input className="field" type="date" value={from} max={until || undefined} onChange={event => setFrom(event.target.value)} /></label>
      <label className="grid gap-1 text-sm font-bold">Vencimento até<input className="field" type="date" value={until} min={from || undefined} onChange={event => setUntil(event.target.value)} /></label>
    </div>
    <div className="mt-3 flex items-center justify-between gap-3 text-sm">
      <p className="text-muted" role="status">{filtered.length} lote(s) encontrado(s)</p>
      <button className="secondary-button" type="button" onClick={() => { setCode(""); setProduct(""); setFrom(""); setUntil(""); }}>Limpar filtros</button>
    </div>
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[850px] text-left text-sm">
        <thead className="border-b text-xs uppercase text-muted"><tr>
          <th className="p-3">Número do lote</th><th className="p-3">Produto / apresentação</th><th className="p-3">Marca</th><th className="p-3 text-right">Qtd.</th><th className="p-3" aria-sort="ascending">Vencimento ↑</th><th className="p-3">Status</th><th className="p-3">Ações</th>
        </tr></thead>
        <tbody className="divide-y">{filtered.map(lot => {
          const status = statusOf(lot, today);
          return <tr key={lot.id}>
            <td className="p-3 font-bold">{lot.code}</td>
            <td className="p-3"><strong>{lot.productName ?? lot.fallbackName}</strong>{lot.presentation && lot.presentation !== "Padrão" && <p className="text-xs text-muted">{lot.presentation}</p>}</td>
            <td className="p-3">{lot.brand || "—"}</td>
            <td className="p-3 text-right"><strong>{quantity(lot.sale + lot.consumption)} {lot.unit === "unit" ? "un." : lot.unit}</strong><p className="whitespace-nowrap text-xs text-muted">Venda: {quantity(lot.sale)} · Consumo: {quantity(lot.consumption)}</p></td>
            <td className="whitespace-nowrap p-3">{lot.expiresOn?.split("-").reverse().join("/") ?? "Não informado"}</td>
            <td className="p-3"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${colors[status]}`}>{status}</span></td>
            <td className="p-3"><Link className="text-brand underline" href={`/estoque/lotes/${lot.id}`}>Detalhes</Link>
            </td>
          </tr>;
        })}</tbody>
      </table>
      {!filtered.length && <p className="py-8 text-center text-sm text-muted">Nenhum lote encontrado para os filtros selecionados.</p>}
    </div>
  </section>;
}
