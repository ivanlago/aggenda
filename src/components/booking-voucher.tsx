"use client";

import { useState } from "react";

export type VoucherQuote = { code: string; originalPriceInCents: number; discountInCents: number; finalPriceInCents: number };
const money = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function BookingVoucher({ slug, serviceId, initialCode, onChange, onPendingChange }: { slug: string; serviceId: string; initialCode: string; onChange: (value: VoucherQuote | null) => void; onPendingChange: (value: boolean) => void }) {
  const [code, setCode] = useState(initialCode);
  const [quote, setQuote] = useState<VoucherQuote | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function apply() {
    setPending(true); onPendingChange(true); setMessage(""); setQuote(null); onChange(null);
    try {
      const response = await fetch(`/api/public/booking/${encodeURIComponent(slug)}/voucher`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceId, code }) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result) throw new Error(result?.error || "Não foi possível consultar o voucher.");
      setQuote(result); onChange(result); setMessage("Voucher aplicado. O benefício será conferido novamente ao confirmar.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível aplicar o voucher."); }
    finally { setPending(false); onPendingChange(false); }
  }
  return <div className="grid gap-2 rounded-xl border bg-white p-4">
    <label htmlFor="booking-voucher" className="text-sm font-bold">Voucher ou cupom (opcional)</label>
    <div className="flex flex-wrap gap-2"><input id="booking-voucher" className="field min-w-0 flex-1" maxLength={40} value={code} disabled={pending} onChange={(event) => { setCode(event.target.value.toUpperCase()); setQuote(null); setMessage(""); onChange(null); }} /><button type="button" className="secondary-button" disabled={pending || !code.trim()} onClick={apply}>{pending ? "Conferindo..." : "Aplicar voucher"}</button></div>
    {quote && <dl className="grid gap-1 text-sm"><div className="flex justify-between"><dt>Valor original</dt><dd>{money(quote.originalPriceInCents)}</dd></div><div className="flex justify-between text-brand"><dt>Desconto</dt><dd>− {money(quote.discountInCents)}</dd></div><div className="flex justify-between font-extrabold"><dt>Total do procedimento</dt><dd>{money(quote.finalPriceInCents)}</dd></div></dl>}
    {message && <p className="text-sm" role="status">{message}</p>}
  </div>;
}
