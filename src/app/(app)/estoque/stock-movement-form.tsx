"use client";

import { ArrowLeftRight } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";
import { getInventoryMovementContext, saveInventoryMovement } from "@/actions/stock-movement";
import { activateInventoryLots } from "@/actions/inventory-lots";
import { ActionForm } from "@/components/action-form";

type Context = Awaited<ReturnType<typeof getInventoryMovementContext>>;
const qty = (value: number) => (value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const unitLabel = (value?: string) => value === "unit" ? "unidade" : value?.toLowerCase() === "ml" ? "mL" : value;

export function StockMovementForm({ products, initialProductId = "", initialLotId = "", initialTab = "movement" }: { products: Array<{ id: string; name: string }>; initialProductId?: string; initialLotId?: string; initialTab?: "movement" | "lots" }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef(0);
  const id = useId();
  const [tab, setTab] = useState(initialTab);
  const [type, setType] = useState("entry");
  const [query, setQuery] = useState("");
  const [productId, setProductId] = useState(initialProductId);
  const [lotId, setLotId] = useState(initialLotId);
  const [context, setContext] = useState<Context | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [identifyLots, setIdentifyLots] = useState(false);
  const [mode, setMode] = useState("entry");
  const filteredProducts = useMemo(() => products.filter(item => item.id === productId || item.name.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR"))), [products, query, productId]);
  async function loadProduct(value: string) {
    const current = ++request.current;
    setLoading(true); setError(""); setContext(null);
    try { const result = await getInventoryMovementContext(value); if (current === request.current) setContext(result); }
    catch (cause) { if (current === request.current) setError(cause instanceof Error ? cause.message : "Não foi possível consultar os lotes. Tente novamente."); }
    finally { if (current === request.current) setLoading(false); }
  }
  function open() { dialog.current?.showModal(); if (productId) void loadProduct(productId); }
  const requiresLots = Boolean(context?.product.tracked || context?.lots.length);
  const usesLots = requiresLots || identifyLots;
  const selectedLot = context?.lots.find(lot => lot.id === lotId);
  const unassignedSale = context ? context.product.sale - context.lots.reduce((sum, lot) => sum + lot.sale, 0) : 0;
  const unassignedConsumption = context ? context.product.consumption - context.lots.reduce((sum, lot) => sum + lot.consumption, 0) : 0;
  const ready = !loading && Boolean(context) && (type === "entry" || !usesLots || context?.product.tracked);
  const label = (lot: Context["lots"][number]) => `${lot.code} · validade ${lot.expiresOn?.split("-").reverse().join("/") ?? "não comprovada"} · venda ${qty(lot.sale)} / consumo ${qty(lot.consumption)}${lot.status === "recalled" ? " · recolhido" : lot.status === "quarantine" ? " · quarentena" : !lot.expiresOn || lot.expiresOn < (context?.today ?? "") ? " · vencido / bloqueado" : ""}`;
  function isUsable(lot: Context["lots"][number]) { return lot.status === "active" && Boolean(lot.expiresOn && lot.expiresOn >= (context?.today ?? "")); }
  return <>
    <button className="secondary-button" type="button" onClick={open}><ArrowLeftRight className="mr-2 inline size-4" />Movimentação</button>
    <dialog ref={dialog} aria-labelledby={`${id}-title`} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl backdrop:bg-slate-950/60" onClose={() => { request.current++; setLoading(false); }}>
      <div className="flex items-start justify-between gap-4"><h2 id={`${id}-title`} className="text-xl font-extrabold">Movimentação de estoque</h2><button className="secondary-button" type="button" onClick={() => dialog.current?.close()}>Fechar</button></div>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Opções de movimentação"><button type="button" className={tab === "movement" ? "primary-button" : "secondary-button"} aria-pressed={tab === "movement"} onClick={() => setTab("movement")}>Registrar movimentação</button><button type="button" className={tab === "lots" ? "primary-button" : "secondary-button"} aria-pressed={tab === "lots"} onClick={() => setTab("lots")}>Lotes e recolhimentos</button></div>
      <div className="mt-4 grid gap-3"><label className="grid gap-1 text-sm font-bold">Buscar produto<input className="field" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Digite o nome do produto" /></label><label className="grid gap-1 text-sm font-bold">Produto<select className="field" value={productId} onChange={event => { const value = event.target.value; setProductId(value); setLotId(""); setIdentifyLots(false); setMode("entry"); void loadProduct(value); }}><option value="" disabled>Selecione o produto</option>{filteredProducts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      {loading && <p className="mt-4 text-sm" role="status">Consultando saldos e lotes…</p>}
      {error && <div className="mt-4 text-sm text-red-700" role="alert">{error}<button className="secondary-button ml-2" type="button" onClick={() => void loadProduct(productId)}>Tentar novamente</button></div>}
      {context && <p className="mt-3 text-sm text-muted">Saldo de venda: {qty(context.product.sale)} · consumo: {qty(context.product.consumption)} {unitLabel(context.product.unit)}. {context.product.tracked ? "Controle por lote ativo." : context.lots.length ? "Distribuição dos lotes em preparação." : "Produto sem controle por lote."}</p>}
      <div hidden={tab !== "movement"}><ActionForm action={saveInventoryMovement} successMessage={usesLots && mode === "existing" && type === "entry" ? "Saldo identificado por lote, sem aumentar o estoque." : "Movimentação registrada."} className="mt-4 grid gap-3" onSuccess={() => { void loadProduct(productId); setLotId(""); }}>
        <input type="hidden" name="productId" value={productId} />
        <label className="grid gap-1 text-sm font-bold">Operação<select className="field" name="type" required value={type} onChange={event => { setType(event.target.value); setLotId(""); setMode("entry"); if (event.target.value !== "entry") setIdentifyLots(false); }}><option value="entry">Entrada</option><option value="exit">Saída / ajuste / descarte</option><option value="consumption">Transferir para consumo</option><option value="usage">Retirada para uso interno</option></select></label>
        {type === "entry" && context && !requiresLots && <label className="flex gap-2 text-sm"><input type="checkbox" name="useLots" checked={identifyLots} onChange={event => setIdentifyLots(event.target.checked)} />Identificar esta entrada por lote e validade</label>}
        {requiresLots && <input type="hidden" name="useLots" value="on" />}
        {usesLots && context && <>
          {type === "entry" && !context.product.tracked && <label className="grid gap-1 text-sm font-bold">Origem da quantidade<select className="field" name="mode" value={mode} onChange={event => setMode(event.target.value)}><option value="entry">Nova entrada — aumenta o estoque</option><option value="existing">Identificar saldo já existente — não aumenta o estoque</option></select></label>}
          {type === "entry" && context.product.tracked && <input type="hidden" name="mode" value="entry" />}
          <label className="grid gap-1 text-sm font-bold">Lote<select className="field" name="lotId" required={type !== "entry"} value={lotId} onChange={event => setLotId(event.target.value)}><option value="">{type === "entry" ? "Cadastrar novo lote" : "Selecione o lote"}</option>{context.lots.map(lot => <option key={lot.id} value={lot.id} disabled={type === "entry" ? lot.status !== "active" || !lot.expiresOn : type !== "exit" && !isUsable(lot)}>{label(lot)}</option>)}</select></label>
          {type === "entry" && !selectedLot && <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-bold">Código do novo lote<input className="field" name="code" required maxLength={100} /></label><label className="grid gap-1 text-sm font-bold">Validade<input className="field" name="expiresOn" type="date" required /></label><label className="grid gap-1 text-sm font-bold sm:col-span-2">Fornecedor (opcional)<input className="field" name="supplier" maxLength={200} /></label></div>}
          {(type === "entry" || type === "exit") && <label className="grid gap-1 text-sm font-bold">{type === "entry" ? "Destino da entrada" : "Retirar de"}<select className="field" name="pool"><option value="sale">Estoque de venda</option><option value="consumption">Estoque de consumo</option></select></label>}
          {type !== "entry" && !context.product.tracked && <p className="text-sm text-amber-800">Conclua a distribuição e ative o controle na opção Lotes e recolhimentos antes de registrar saídas.</p>}
          <p className="text-xs text-muted">{type === "entry" ? "Informe o lote e a validade da quantidade recebida ou identifique o saldo já existente, sem aumentá-lo." : type === "exit" ? "Saída / descarte pode retirar lotes vencidos ou bloqueados. Informe o motivo e o destino." : "Transferências e uso interno exigem lote válido e liberado. Aplicações em pacientes devem ser registradas na consulta."}</p>
        </>}
        <label className="grid gap-1 text-sm font-bold">Quantidade{context ? ` (${unitLabel(context.product.unit)})` : ""}<input className="field" name="quantity" inputMode="decimal" required /></label>
        <label className="grid gap-1 text-sm font-bold">Motivo{usesLots || ["entry", "exit"].includes(type) ? "" : " (opcional)"}<input className="field" name="notes" minLength={usesLots || ["entry", "exit"].includes(type) ? 3 : undefined} required={usesLots || ["entry", "exit"].includes(type)} maxLength={1000} placeholder={type === "entry" ? "Ex.: Compra de mercadorias" : "Informe a finalidade ou o destino"} /></label>
        <button className="primary-button" disabled={!ready}>Registrar movimentação</button>
      </ActionForm></div>
      <div hidden={tab !== "lots"}><section className="mt-4 grid gap-3" aria-label="Lotes do produto">
        {!context && !loading && !error && <p className="text-sm text-muted">Selecione um produto para consultar os lotes e os recolhimentos.</p>}
        {context && <>
          {!context.product.tracked && <div className="rounded-xl border p-3"><h3 className="font-bold">Preparar controle por lote</h3><p className="mt-2 text-sm">Sem lote: venda {qty(unassignedSale)} · consumo {qty(unassignedConsumption)} {unitLabel(context.product.unit)}. Identifique o saldo real antes de ativar; a quantidade total será preservada.</p><button type="button" className="secondary-button mt-3" onClick={() => { setType("entry"); setMode("existing"); setIdentifyLots(true); setLotId(""); setTab("movement"); }}>Identificar saldo existente por lote</button><ActionForm action={activateInventoryLots} successMessage="Controle por lote ativado." className="mt-3" onSuccess={() => void loadProduct(productId)}><input type="hidden" name="productId" value={productId} /><button className="secondary-button" disabled={context.truncated || unassignedSale !== 0 || unassignedConsumption !== 0}>Ativar controle por lote após conferência</button></ActionForm></div>}
          {context.lots.map(lot => <article className="rounded-xl border p-3 text-sm" key={lot.id}><p className="font-bold">{label(lot)}</p><Link className="secondary-button mt-3" href={`/estoque/lotes/${lot.id}`}>Rastreabilidade, bloqueios e recolhimento</Link></article>)}
          {!context.lots.length && <p className="text-sm text-muted">Nenhum lote cadastrado para este produto.</p>}
          {context.truncated && <p className="text-sm text-amber-800">Exibindo os primeiros 1.000 lotes por validade. Use a consulta completa para localizar os demais.</p>}
        </>}
        <Link className="secondary-button w-fit" href={productId ? `/estoque/lotes?productId=${productId}` : "/estoque/lotes"}>Consulta completa de lotes e recolhimentos</Link>
      </section></div>
    </dialog>
  </>;
}
