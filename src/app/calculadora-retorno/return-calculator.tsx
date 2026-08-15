"use client";

import { useState } from "react";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ReturnCalculator() {
  const [patients, setPatients] = useState(100); const [ticket, setTicket] = useState(250); const [conversion, setConversion] = useState(12);
  const recovered = Math.round(patients * conversion / 100); const revenue = recovered * ticket;
  return <div className="mt-6 grid gap-5"><div className="grid gap-4 sm:grid-cols-3"><label className="grid gap-2 text-sm font-bold">Pacientes inativos<input className="field" type="number" min="0" value={patients} onChange={(event) => setPatients(Number(event.target.value))} /></label><label className="grid gap-2 text-sm font-bold">Ticket médio (R$)<input className="field" type="number" min="0" value={ticket} onChange={(event) => setTicket(Number(event.target.value))} /></label><label className="grid gap-2 text-sm font-bold">Conversão esperada (%)<input className="field" type="number" min="0" max="100" value={conversion} onChange={(event) => setConversion(Number(event.target.value))} /></label></div><div className="rounded-2xl bg-brand p-6 text-white"><p className="text-sm font-bold text-white/70">Potencial estimado por campanha</p><p className="mt-2 text-4xl font-extrabold">{money(revenue)}</p><p className="mt-2 text-sm">aproximadamente {recovered} pacientes recuperados</p></div><p className="text-xs text-muted">Estimativa ilustrativa, sem garantia de resultado. Ajuste a conversão usando o histórico real do seu negócio.</p></div>;
}
