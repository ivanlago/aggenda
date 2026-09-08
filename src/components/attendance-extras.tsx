"use client";

import { useState } from "react";

const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function AttendanceQuote({ service, price }: { service: string; price: number }) {
  const [items, setItems] = useState([{ id: 0, description: service, quantity: 1, unitPrice: price }]);
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return <>
    <input type="hidden" name="attendanceDocumentType" value="quote" />
    <input type="hidden" name="quoteItems" value={JSON.stringify(items)} />
    <p className="text-sm text-muted">Revise os itens e condições antes de emitir. O orçamento ficará salvo nos documentos do cliente.</p>
    {items.map((item) => <div key={item.id} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_90px_130px_auto]">
      <label className="grid gap-1 text-sm font-bold">Procedimento / produto<input className="field" required maxLength={300} value={item.description} onChange={(event) => setItems(items.map((row) => row.id === item.id ? { ...row, description: event.target.value } : row))} /></label>
      <label className="grid gap-1 text-sm font-bold">Quantidade<input className="field" type="number" required min={1} max={1000} step={1} value={item.quantity} onChange={(event) => setItems(items.map((row) => row.id === item.id ? { ...row, quantity: Number(event.target.value) } : row))} /></label>
      <label className="grid gap-1 text-sm font-bold">Valor unitário<input className="field" type="number" required min={0} max={1000000} step="0.01" value={item.unitPrice / 100} onChange={(event) => setItems(items.map((row) => row.id === item.id ? { ...row, unitPrice: Math.round(Number(event.target.value) * 100) } : row))} /></label>
      <button className="text-sm font-bold text-red-600" type="button" disabled={items.length === 1} onClick={() => setItems(items.filter((row) => row.id !== item.id))}>Remover</button>
    </div>)}
    <button type="button" className="secondary-button w-fit" disabled={items.length >= 50} onClick={() => setItems([...items, { id: Math.max(...items.map((item) => item.id)) + 1, description: "", quantity: 1, unitPrice: 0 }])}>+ Adicionar item</button>
    <p className="text-xl font-extrabold">Total: {money(total)}</p>
    <label className="grid gap-2 text-sm font-bold">Válido até<input className="field" type="date" name="validity" required /></label>
    <label className="grid gap-2 text-sm font-bold">Condições de pagamento e observações<textarea className="field min-h-24" name="conditions" maxLength={3000} /></label>
    <button className="primary-button w-fit">Salvar orçamento e abrir PDF</button>
  </>;
}

export function CompanionDeclaration({ clientName, date }: { clientName: string; date: string }) {
  const [name, setName] = useState("");
  const [period, setPeriod] = useState("");
  const content = `Declaro, para os devidos fins, que ${name} acompanhou ${clientName} em atendimento na {{clinica}}, em ${date}, no período de ${period}.\n\nProfissional responsável: {{profissional}}.`;
  return <>
    <input type="hidden" name="attendanceDocumentType" value="companion_declaration" />
    <input type="hidden" name="content" value={content} />
    <label className="grid gap-2 text-sm font-bold">Nome completo do acompanhante<input className="field" required maxLength={180} value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label className="grid gap-2 text-sm font-bold">Período de acompanhamento<input className="field" required maxLength={100} placeholder="Ex.: das 14h às 15h30" value={period} onChange={(event) => setPeriod(event.target.value)} /></label>
    <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm">{content.replace("{{clinica}}", "esta clínica").replace("{{profissional}}", "profissional do atendimento")}</p>
    <button className="primary-button w-fit">Emitir declaração e abrir PDF</button>
  </>;
}
