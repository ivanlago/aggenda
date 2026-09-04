"use client";

import { Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

export type StockMovementRow = {
  id: string;
  productName: string;
  presentation: string;
  type: string;
  typeLabel: string;
  direction: "entry" | "exit";
  quantity: string;
  balance: string;
  notes: string;
  occurredAt: string;
  occurredOn: string;
  occurredAtLabel: string;
};

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

const today = () => new Date().toISOString().slice(0, 10);

export function StockMovementList({ movements }: { movements: StockMovementRow[] }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [type, setType] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const filtered = useMemo(() => movements.filter((item) => {
    const searchable = normalize(`${item.productName} ${item.presentation} ${item.notes}`);
    const date = item.occurredOn;
    return searchable.includes(normalize(deferredQuery))
      && (type === "all" || item.type === type)
      && (!startDate || date >= startDate)
      && (!endDate || date <= endDate);
  }), [movements, deferredQuery, type, startDate, endDate]);

  return <section className="panel">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-extrabold">Movimentações</h2>
        <p className="text-sm text-muted">Histórico de entradas, saídas, consumo, vendas e estornos.</p>
      </div>
      <label className="relative w-full sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input className="field w-full pl-9" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produto ou motivo" />
      </label>
    </div>

    <div className="mt-4 grid gap-2 sm:grid-cols-3">
      <label className="grid gap-1 text-sm font-bold">De
        <input className="field" type="date" value={startDate} max={endDate || today()} onChange={(event) => setStartDate(event.target.value)} />
      </label>
      <label className="grid gap-1 text-sm font-bold">Até
        <input className="field" type="date" value={endDate} min={startDate || undefined} max={today()} onChange={(event) => setEndDate(event.target.value)} />
      </label>
      <label className="grid gap-1 text-sm font-bold">Tipo
        <select className="field" value={type} onChange={(event) => setType(event.target.value)}>
          <option value="all">Todas as movimentações</option>
          <option value="entry">Entrada</option>
          <option value="initial">Estoque inicial</option>
          <option value="exit">Saída / ajuste</option>
          <option value="consumption">Retirada para consumo</option>
          <option value="sale">Venda</option>
          <option value="sale_cancellation">Cancelamento de venda</option>
          <option value="sale_refund">Estorno de venda</option>
        </select>
      </label>
    </div>

    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="border-b text-xs uppercase text-muted"><tr>
          <th className="p-3">Data e hora</th><th className="p-3">Produto</th><th className="p-3">Tipo</th>
          <th className="p-3 text-right">Quantidade</th><th className="p-3 text-right">Saldo</th><th className="p-3">Motivo / referência</th>
        </tr></thead>
        <tbody className="divide-y">{filtered.map((item) => <tr key={item.id}>
          <td className="whitespace-nowrap p-3">{item.occurredAtLabel}</td>
          <td className="p-3"><strong>{item.productName}</strong>{item.presentation !== "—" && <p className="text-xs text-muted">{item.presentation}</p>}</td>
          <td className="p-3"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${item.direction === "entry" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{item.typeLabel}</span></td>
          <td className={`p-3 text-right font-bold ${item.direction === "entry" ? "text-brand" : "text-amber-800"}`}>{item.direction === "entry" ? "+" : "−"}{item.quantity}</td>
          <td className="p-3 text-right">{item.balance}</td>
          <td className="p-3 text-muted">{item.notes || "—"}</td>
        </tr>)}</tbody>
      </table>
      {!filtered.length && <p className="py-8 text-center text-sm text-muted">Nenhuma movimentação encontrada para os filtros selecionados.</p>}
    </div>
  </section>;
}
