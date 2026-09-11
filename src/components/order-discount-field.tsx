"use client";

import type { DiscountType } from "@/lib/order-discount";

export function OrderDiscountField({ type, value, onTypeChange, onValueChange, error }: {
  type: DiscountType; value: string; onTypeChange: (type: DiscountType) => void; onValueChange: (value: string) => void; error?: string;
}) {
  return <div className="grid gap-2">
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-bold">Desconto geral</span>
      <select className="field w-20" aria-label="Tipo de desconto geral" value={type} onChange={(event) => onTypeChange(event.target.value as DiscountType)}><option value="amount">R$</option><option value="percent">%</option></select>
      <input className="field w-28" aria-label="Valor do desconto geral" aria-invalid={Boolean(error)} inputMode="decimal" placeholder="0,00" value={value} onChange={(event) => onValueChange(event.target.value)} />
    </div>
    {error ? <p className="text-xs text-red-700" role="alert">{error}</p> : <p className="text-xs text-muted">Aplicado sobre o saldo após os descontos dos itens.</p>}
  </div>;
}
