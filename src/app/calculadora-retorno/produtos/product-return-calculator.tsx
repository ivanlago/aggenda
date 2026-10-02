"use client";

import { useState } from "react";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fields = [
  { key: "purchase", label: "Custo de compra por unidade (R$)", percentage: false },
  { key: "freight", label: "Frete por unidade (R$)", percentage: false },
  { key: "packaging", label: "Embalagem por unidade (R$)", percentage: false },
  { key: "commission", label: "Comissão (%)", percentage: true },
  { key: "fees", label: "Impostos e taxas (%)", percentage: true },
  { key: "margin", label: "Margem desejada (%)", percentage: true },
] as const;

export function ProductReturnCalculator() {
  const [values, setValues] = useState({ purchase: 50, freight: 5, packaging: 2, commission: 5, fees: 4, margin: 30 });
  const directCost = values.purchase + values.freight + values.packaging;
  const percentage = values.commission + values.fees + values.margin;
  const valid = percentage < 100;
  const price = valid ? directCost / (1 - percentage / 100) : 0;
  const contribution = price * values.margin / 100;

  return <div className="mt-6 grid gap-5">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{fields.map(({ key, label, percentage: isPercentage }) => <label key={key} className="grid content-start gap-2 text-sm font-bold">{label}<input className="field" type="number" min="0" max={isPercentage ? 100 : undefined} step="0.01" value={values[key]} onChange={(event) => { const number = Number(event.target.value); setValues((current) => ({ ...current, [key]: Number.isFinite(number) ? Math.max(0, isPercentage ? Math.min(100, number) : number) : 0 })); }} /></label>)}</div>
    {valid ? <div className="rounded-2xl bg-brand p-6 text-white"><p className="text-sm font-bold text-white/70">Preço sugerido por unidade</p><p className="mt-2 text-4xl font-extrabold">{money(price)}</p><p className="mt-2 text-sm">Custo direto {money(directCost)} · contribuição estimada {money(contribution)} por unidade</p></div> : <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">A soma de comissão, impostos e taxas e margem desejada deve ser menor que 100% para calcular um preço.</p>}
    <p className="text-xs text-muted">A margem é calculada sobre o preço de venda. Distribua o frete entre as unidades compradas. A contribuição estimada ainda precisa cobrir os custos fixos e eventuais perdas.</p>
  </div>;
}
