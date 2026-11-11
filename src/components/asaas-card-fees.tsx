"use client";

import { useState, useTransition } from "react";
import { consultAsaasCardFees } from "@/actions/payment-charges";

const percent = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function AsaasCardFees({ scope }: { scope: "pos" | "receivable" }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Awaited<ReturnType<typeof consultAsaasCardFees>>>();

  return <div className="col-span-full grid gap-2 text-sm">
    <button className="secondary-button justify-self-start" type="button" disabled={pending} onClick={() => startTransition(async () => {
      try { setResult(await consultAsaasCardFees(scope)); }
      catch { setResult({ error: "Não foi possível consultar as tarifas do Asaas." }); }
    })}>{pending ? "Consultando…" : "Consultar tarifas do Asaas"}</button>
    {result?.error && <p role="status">{result.error}</p>}
    {result?.tiers && <div className="grid gap-1" role="status">
      <p className="text-muted">Tarifas da conta consultadas em {new Date(result.quotedAt).toLocaleString("pt-BR")}.</p>
      {result.operation !== null && <p>Tarifa operacional por cobrança de {money.format(result.operation)}.</p>}
      <ul className="flex flex-wrap gap-x-4 gap-y-1">{result.tiers.map(tier => <li key={tier.label}>{tier.label} · {percent.format(tier.value)}%</li>)}</ul>
    </div>}
  </div>;
}
