"use client";

import { useState } from "react";
import { serviceDepositDisplay } from "@/lib/service-deposit";

export function ServiceDepositFields({ type = "none", value = 0 }: { type?: string; value?: number }) {
  const [depositType, setDepositType] = useState(type);
  const [amount, setAmount] = useState(() => serviceDepositDisplay(type, value));
  const enabled = depositType === "fixed" || depositType === "percentage";
  return <>
    <label className="grid min-w-0 content-start gap-2 text-sm font-bold"><span className="self-end">Tipo de sinal</span><select className="field" name="depositType" value={depositType} onChange={(event) => { setDepositType(event.target.value); setAmount(""); }}><option value="none">Sem sinal</option><option value="fixed">Sinal em reais</option><option value="percentage">Sinal percentual</option><option value="full">Pagamento integral</option></select></label>
    <label className="grid min-w-0 content-start gap-2 text-sm font-bold"><span className="self-end">Valor do sinal (R$ ou %)</span><input className="field" name="depositValue" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={!enabled} required={enabled} placeholder={depositType === "percentage" ? "Ex.: 20" : "Ex.: 50,00"} /><span className="text-xs font-normal text-muted">{depositType === "fixed" ? "Informe o valor em reais." : depositType === "percentage" ? "Informe o percentual de 0 a 100." : "Não é necessário informar um valor."}</span></label>
  </>;
}
