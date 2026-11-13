"use client";

import { useState } from "react";
import { recordPartnershipAllocation } from "@/actions/partnership-allocations";
import { calculateFiscalShare, parseHundredths } from "@/lib/professional-fiscal-share";
import { ActionForm } from "./action-form";

const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
type Receipt = { id: string; description: string; amount: number; realizedDate: string | null };
type Service = { id: string; name: string; rate: number };

export function PartnershipAllocationForm({ professionalId, receipts, services }: { professionalId: string; receipts: Receipt[]; services: Service[] }) {
  const [serviceId, setServiceId] = useState("");
  const [gross, setGross] = useState("");
  const [withheld, setWithheld] = useState("0");
  const service = services.find(row => row.id === serviceId);
  const amount = parseHundredths(gross), tax = parseHundredths(withheld);
  const split = service && amount !== null ? calculateFiscalShare(amount, service.rate) : null;
  return <ActionForm action={recordPartnershipAllocation} resetOnSuccess={false} successMessage="Apuração registrada. Confira os documentos fiscais e o repasse com seu contador." className="grid gap-3">
    <input type="hidden" name="professionalId" value={professionalId} />
    <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-bold">Recebimento *<select className="field" name="financialEntryId" required defaultValue=""><option value="">Selecione</option>{receipts.map(row => <option key={row.id} value={row.id}>{row.realizedDate} · {row.description} · {money(row.amount)}</option>)}</select></label><label className="grid gap-1 text-sm font-bold">Serviço com cota contratual *<select className="field" name="serviceId" value={serviceId} onChange={event => setServiceId(event.target.value)} required><option value="">Selecione</option>{services.map(row => <option key={row.id} value={row.id}>{row.name} · {row.rate / 100}%</option>)}</select></label></div>
    <div className="grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-sm font-bold">Valor recebido deste serviço (R$) *<input className="field" inputMode="decimal" name="gross" value={gross} onChange={event => setGross(event.target.value)} required /></label><label className="grid gap-1 text-sm font-bold">Tributos retidos do parceiro (R$)<input className="field" inputMode="decimal" name="withheld" value={withheld} onChange={event => setWithheld(event.target.value)} /></label><label className="grid gap-1 text-sm font-bold">Tributos / orientação contábil<input className="field" name="withholdingDescription" required={tax !== null && tax > 0} maxLength={2000} /></label></div>
    <p className="text-sm text-muted">Em recebimentos com vários itens, informe somente o valor atribuível a este serviço. A retenção é informada pela clínica com orientação contábil; o Aggenda não calcula alíquotas tributárias.</p>
    {split && <p className="text-sm font-bold" aria-live="polite">Clínica: {money(split.salon)} · Parceiro: {money(split.professional)} · Líquido a repassar: {tax !== null && tax <= split.professional ? money(split.professional - tax) : "Revise as retenções"}</p>}
    <label className="flex items-start gap-2 text-sm"><input name="confirmed" type="checkbox" required />Confirmo que o serviço e o valor recebido pertencem a esta parceria e conferi as retenções com minha assessoria.</label>
    <div><button className="primary-button" disabled={!split || !amount || tax === null || tax > split.professional}>Registrar apuração</button></div>
  </ActionForm>;
}
