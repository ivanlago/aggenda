"use client";

import { useState, useTransition } from "react";
import { simulatePagBankInstallments } from "@/actions/pagbank";
import { onlineInstallmentTerms, pagBankInstallmentPolicy, type OnlineInstallmentRules } from "@/lib/payment-catalog-policy";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (cents: number) => currency.format(cents / 100);

export function PagBankInstallmentFields({ defaults, amount, canOverride, scope }: {
  defaults: OnlineInstallmentRules; amount: number; canOverride: boolean; scope: "pos" | "receivable";
}) {
  const [override, setOverride] = useState(false);
  const [maximum, setMaximum] = useState(String(defaults.useProviderMaximum ? 12 : Math.min(12, defaults.maximum)));
  const [interestFree, setInterestFree] = useState(String(Math.min(12, defaults.interestFree)));
  const [allowBuyerInterest, setAllowBuyerInterest] = useState(defaults.allowBuyerInterest);
  const [bin, setBin] = useState("");
  const [pending, startTransition] = useTransition();
  const [quote, setQuote] = useState<{ key: string; response: Awaited<ReturnType<typeof simulatePagBankInstallments>> }>();
  const editing = canOverride && override;
  const custom = maximum && interestFree ? pagBankInstallmentPolicy(Number(maximum), Number(interestFree)) : null;
  const rules = editing && custom ? { ...defaults, ...custom, useProviderMaximum: false, allowBuyerInterest } : defaults;
  const terms = onlineInstallmentTerms(rules, amount, "pagbank");
  const quoteKey = JSON.stringify([bin, amount, editing, rules]);
  const result = quote?.key === quoteKey ? quote.response : undefined;
  const canSimulate = !pending && bin.length === 6 && amount >= 500 && (!editing || Boolean(custom));

  function simulate() {
    const data = new FormData();
    data.set("scope", scope);
    data.set("amountInCents", String(amount));
    data.set("bin", bin);
    if (editing) {
      data.set("overridePagBankTerms", "on");
      data.set("pagBankMaximum", maximum);
      data.set("pagBankInterestFree", interestFree);
      if (allowBuyerInterest) data.set("pagBankBuyerInterest", "on");
    }
    startTransition(async () => {
      try {
        setQuote({ key: quoteKey, response: await simulatePagBankInstallments(data) });
      } catch {
        setQuote({ key: quoteKey, response: { error: "A simulação está indisponível no momento." } });
      }
    });
  }

  return <fieldset className="col-span-full grid min-w-0 gap-3 rounded-xl border p-3">
    <legend className="px-1 text-sm font-bold">Parcelamento online</legend>
    <p className="text-sm" aria-live="polite">
      {terms.maximum === 1 ? "À vista no cartão" : `Até ${terms.maximum}× no cartão`}
      {terms.interestFree > 1 && `, sendo até ${terms.interestFree}× sem juros`}
      {terms.maximum > Math.max(1, terms.interestFree) && ". Nas demais opções, o PagBank calcula os juros no checkout"}.
      Parcela mínima sobre o valor da venda de {money(Math.max(500, defaults.minimumInCents))}.
    </p>
    {terms.mixedUnavailable && <p className="text-sm text-amber-800">O PagBank pode cobrar parte do parcelamento da empresa acima do limite sem juros. Este link oferece apenas as parcelas sem juros para respeitar a regra de repasse integral.</p>}
    {canOverride && <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="overridePagBankTerms" checked={override} onChange={event => setOverride(event.target.checked)} />Alterar nesta cobrança</label>}
    {editing && <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm font-bold">Máximo de parcelas<input className="field" name="pagBankMaximum" type="number" min={1} max={12} required value={maximum} onChange={event => setMaximum(event.target.value)} /></label>
      <label className="grid gap-1 text-sm font-bold">Até quantas parcelas sem juros<input className="field" name="pagBankInterestFree" type="number" min={0} max={maximum || 12} required value={interestFree} onChange={event => setInterestFree(event.target.value)} /></label>
      <label className="col-span-full flex items-center gap-2 text-sm"><input type="checkbox" name="pagBankBuyerInterest" checked={allowBuyerInterest} onChange={event => setAllowBuyerInterest(event.target.checked)} />Oferecer parcelas com juros acima do limite sem juros</label>
    </div>}
    <details>
      <summary className="cursor-pointer text-sm font-bold text-brand">Simular custos</summary>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm font-bold">Seis primeiros dígitos do cartão<input className="field w-28" inputMode="numeric" maxLength={6} autoComplete="off" value={bin}
          onChange={event => setBin(event.target.value.replace(/\D/g, ""))}
          onKeyDown={event => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (canSimulate) simulate();
            }
          }} /></label>
        <button type="button" className="secondary-button" onClick={simulate} disabled={!canSimulate}>{pending ? "Consultando…" : "Consultar PagBank"}</button>
      </div>
      {result?.error && <p className="mt-2 text-sm text-muted" role="status">{result.error}</p>}
      {result?.plans && <>
        <p className="mt-2 text-xs text-muted" role="status">Simulação de {new Date(result.quotedAt).toLocaleString("pt-BR")}{result.sandbox ? " · valores fictícios do ambiente de testes" : ""}. O comprador confere o valor final no checkout.</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr><th scope="col">Parcelas</th><th scope="col">Total do comprador</th><th scope="col">Tarifa informada</th><th scope="col">Líquido estimado</th></tr></thead>
            <tbody>{result.plans.map(plan => <tr className="border-t" key={`${plan.brand}-${plan.count}`}>
              <td className="py-1">{plan.count}× {money(plan.installment)} <span className="text-xs text-muted">{plan.brand}</span></td>
              <td>{money(plan.total)}</td>
              <td>{plan.sellerFee === null ? "Indisponível" : money(plan.sellerFee)}</td>
              <td>{plan.sellerFee === null ? "Indisponível" : money(result.amount - plan.sellerFee)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </>}
    </details>
  </fieldset>;
}
