"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { searchInventoryLots } from "@/actions/stock-movement";

type Result = Awaited<ReturnType<typeof searchInventoryLots>>;
type Lot = Result["rows"][number];
type Props = { onSelect: (lot: Lot, operation: "expired" | "recall") => void };
const qty = (value: number) => (value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

function SearchGroup({ kind, onSelect }: Props & { kind: "expired" | "code" }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [searched, setSearched] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  async function search(page = 1, term = query) {
    const current = ++request.current;
    setBusy(true); setError(""); setResult(null);
    try {
      const next = await searchInventoryLots({ kind, query: term, page });
      if (current === request.current) { setResult(next); setSearched(term); }
    } catch (cause) { if (current === request.current) setError(cause instanceof Error ? cause.message : "Não foi possível consultar os lotes."); }
    finally { if (current === request.current) setBusy(false); }
  }
  return <section className="min-w-0 rounded-xl border p-3" aria-label={kind === "expired" ? "Lotes vencidos" : "Busca por lote"}>
    <h3 className="font-bold">{kind === "expired" ? "Lotes vencidos com saldo" : "Buscar número do lote"}</h3>
    <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void search(); }}>
      <label className="grid min-w-0 flex-1 gap-1 text-sm font-bold">{kind === "expired" ? "Produto (opcional)" : "Número do lote"}<input className="field min-w-0" type="search" required={kind === "code"} maxLength={100} value={query} onChange={event => setQuery(event.target.value)} placeholder={kind === "expired" ? "Todos os produtos" : "Digite o lote informado no recall"} /></label>
      <button className="secondary-button" disabled={busy}>{kind === "expired" ? "Buscar vencidos" : "Buscar lote"}</button>
    </form>
    {busy && <p className="mt-3 text-sm" role="status">Consultando lotes…</p>}
    {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
    {result && <div className="mt-3" aria-live="polite">
      {!result.rows.length ? <p className="text-sm text-muted">{kind === "expired" ? "Nenhum lote vencido com saldo encontrado." : "Nenhum produto com saldo encontrado para este lote."}</p> : <>
        <div className="grid grid-cols-[minmax(0,1fr)_5rem_6rem] gap-2 border-b pb-2 text-xs font-bold"><span>Produto</span><span>Qtd.</span><span>Data entrada</span></div>
        {result.rows.map(lot => <article key={lot.id} className="border-b py-3 text-sm">
          <div className="grid grid-cols-[minmax(0,1fr)_5rem_6rem] items-start gap-2"><span className="truncate font-bold" title={lot.name}>{lot.name}</span><span className="break-words">{qty(lot.sale + lot.consumption)} {lot.unit === "unit" ? "un." : lot.unit}</span><span>{lot.enteredOn}</span></div>
          <p className="mt-1 break-words text-xs text-muted">Lote: {lot.code} · Validade: {lot.expiresOn?.split("-").reverse().join("/") ?? "Não informada"} · {lot.status === "recalled" ? "Recolhido / bloqueado" : lot.status === "quarantine" ? "Quarentena" : "Ativo"}</p>
          <p className="mt-1 text-xs text-muted">Venda: {qty(lot.sale)} · Consumo: {qty(lot.consumption)}</p>
          <div className="mt-2 flex flex-wrap gap-2"><button className="secondary-button" type="button" onClick={() => onSelect(lot, kind === "expired" ? "expired" : "recall")}>Registrar saída</button><Link className="secondary-button" href={`/estoque/lotes/${lot.id}`}>Detalhes e histórico</Link></div>
        </article>)}
        <nav className="mt-3 flex items-center justify-between gap-2" aria-label={kind === "expired" ? "Páginas de vencidos" : "Páginas da busca por lote"}><button className="secondary-button" type="button" disabled={busy || result.page === 1} onClick={() => void search(result.page - 1, searched)}>Anterior</button><span className="text-xs">Página {result.page}</span><button className="secondary-button" type="button" disabled={busy || !result.hasMore} onClick={() => void search(result.page + 1, searched)}>Próxima</button></nav>
      </>}
    </div>}
  </section>;
}

export function StockLotSearch(props: Props) {
  return <div className="grid min-w-0 gap-4"><SearchGroup kind="expired" {...props} /><SearchGroup kind="code" {...props} /><p className="text-xs text-muted">Quantidade soma venda e consumo. Data de entrada corresponde ao primeiro cadastro do lote; reposições ficam no histórico. A consulta não retira nem bloqueia produtos: registre a saída para isso. Validades ausentes não aparecem entre os vencidos.</p></div>;
}
