"use client";

import { useState } from "react";
import { saveFiscalServiceShare } from "@/actions/professional-fiscal-partnership";
import { ActionForm } from "@/components/action-form";
import { calculateFiscalShare, parseHundredths } from "@/lib/professional-fiscal-share";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percent = (points: number) => String(points / 100).replace(".", ",");

type Service = { id: string; name: string; priceInCents: number | null; saved: number | null; suggestion: number | null };

export function FiscalShareForm({ professionalId, services }: { professionalId?: string; services: Service[] }) {
  const [serviceId, setServiceId] = useState("");
  const [amount, setAmount] = useState("100,00");
  const [percentage, setPercentage] = useState("40");
  const [confirmed, setConfirmed] = useState(false);
  const service = services.find(item => item.id === serviceId);
  const cents = parseHundredths(amount);
  const basisPoints = parseHundredths(percentage);
  const share = cents === null || basisPoints === null ? null : calculateFiscalShare(cents, basisPoints);

  const simulation = <>
    <label className="grid gap-1 text-sm font-bold">Valor do serviço (R$)
      <input className="field" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} />
    </label>
    <label className="grid gap-1 text-sm font-bold">Percentual do profissional
      <input className="field" name="percentage" inputMode="decimal" value={percentage} onChange={event => {
        setPercentage(event.target.value);
        setConfirmed(false);
      }} required />
    </label>
    <p className="rounded-xl bg-slate-50 p-3 text-sm" aria-live="polite">
      {share ? <>Profissional: <strong>{money.format(share.professional / 100)}</strong> · Salão: <strong>{money.format(share.salon / 100)}</strong></>
        : "Informe um valor válido e um percentual entre 0 e 100%."}
    </p>
  </>;

  if (!professionalId) return <div className="grid gap-3">{simulation}</div>;

  return <ActionForm action={saveFiscalServiceShare} successMessage="Percentual contratual salvo." resetOnSuccess={false}
    onSuccess={() => setConfirmed(false)} className="grid gap-3">
    <input type="hidden" name="professionalId" value={professionalId} />
    <label className="grid gap-1 text-sm font-bold">Serviço
      <select className="field" name="serviceId" value={serviceId} required onChange={event => {
        const next = services.find(item => item.id === event.target.value);
        setServiceId(event.target.value);
        setAmount(next?.priceInCents == null ? "" : (next.priceInCents / 100).toFixed(2).replace(".", ","));
        setPercentage(next?.saved == null ? "" : percent(next.saved));
        setConfirmed(false);
      }}>
        <option value="">Selecione o serviço para salvar o percentual</option>
        {services.map(item => <option key={item.id} value={item.id}>{item.name}{item.saved !== null ? " · " + percent(item.saved) + "%" : ""}</option>)}
      </select>
    </label>
    {service?.suggestion != null && <div>
      <button type="button" className="secondary-button" onClick={() => {
        setPercentage(percent(service.suggestion!));
        setConfirmed(false);
      }}>Usar comissão de {percent(service.suggestion)}% como sugestão</button>
    </div>}
    {simulation}
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name="confirmed" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} required />
      O percentual informado corresponde ao contrato de parceria.
    </label>
    <div><button className="primary-button" disabled={!service || !confirmed || basisPoints === null || basisPoints > 10_000}>
      Salvar percentual do serviço
    </button></div>
  </ActionForm>;
}
