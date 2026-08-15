"use client";

import { useMemo, useState } from "react";
import { createProviderCharge } from "@/actions/mercado-pago";
import { ActionForm } from "@/components/action-form";

type Entry = { id: string; description: string; amount: string; dueDate: string; clientName: string; clientEmail: string; clientPhone: string };

export function ChargeCreateForm({ entries, providers }: { entries: Entry[]; providers: Array<"asaas" | "mercado_pago"> }) {
  const [entryId, setEntryId] = useState(entries[0]?.id ?? "");
  const [provider, setProvider] = useState<"asaas" | "mercado_pago">(providers[0] ?? "asaas");
  const selected = useMemo(() => entries.find((entry) => entry.id === entryId), [entries, entryId]);
  return <ActionForm action={createProviderCharge} successMessage="Pagamento criado com sucesso." className="grid gap-3">
    <label className="grid gap-1 text-xs font-bold">Conta de recebimento<select className="field" name="provider" value={provider} onChange={(event) => setProvider(event.target.value as "asaas" | "mercado_pago")}><option value="asaas" disabled={!providers.includes("asaas")}>Asaas{providers.includes("asaas") ? "" : " · não conectado"}</option><option value="mercado_pago" disabled={!providers.includes("mercado_pago")}>Mercado Pago{providers.includes("mercado_pago") ? "" : " · não conectado"}</option></select></label>
    <label className="grid gap-1 text-xs font-bold">Conta a receber<select className="field" name="financialEntryId" required value={entryId} onChange={(event) => setEntryId(event.target.value)}><option value="">Selecione</option>{entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.description} · {entry.amount} · {entry.dueDate}</option>)}</select></label>
    <div className="grid gap-3 md:grid-cols-2">
      <input key={`${entryId}:name`} aria-label="Nome do pagador" className="field" name="customerName" required defaultValue={selected?.clientName} placeholder="Nome do pagador" />
      <input aria-label="CPF ou CNPJ do pagador" className="field" name="customerDocument" required inputMode="numeric" placeholder="CPF ou CNPJ" />
      <input key={`${entryId}:email`} aria-label="E-mail do pagador" className="field" name="customerEmail" type="email" defaultValue={selected?.clientEmail} placeholder="E-mail" />
      <input key={`${entryId}:phone`} aria-label="WhatsApp do pagador" className="field" name="customerPhone" inputMode="tel" defaultValue={selected?.clientPhone} placeholder="WhatsApp" />
      {provider === "asaas" && <><label className="grid gap-1 text-xs font-bold">Meio<select className="field" name="paymentMethod"><option value="pix">Pix</option><option value="boleto">Boleto</option><option value="link">Link com escolha do cliente</option><option value="credit_card">Cartão de crédito</option></select></label><label className="grid gap-1 text-xs font-bold">Modalidade<select className="field" name="chargeMode"><option value="single">Cobrança única</option><option value="installment">Parcelada</option><option value="recurring">Recorrência mensal</option></select></label><label className="grid gap-1 text-xs font-bold">Parcelas (se parcelada)<input className="field" name="installmentCount" type="number" min="2" max="24" defaultValue="2" /></label></>}
    </div>
    <p className="text-xs text-muted">Nome, e-mail e telefone vêm do paciente vinculado. O CPF/CNPJ ainda precisa ser confirmado por segurança.</p>
    <p className="text-xs text-muted">{provider === "mercado_pago" ? "O cliente escolherá Pix, boleto ou cartão no Checkout Pro do Mercado Pago." : "O meio e a modalidade serão definidos na cobrança Asaas."}</p>
    <button className="primary-button sm:w-fit" disabled={!entries.length || !providers.length}>Gerar pagamento</button>
  </ActionForm>;
}
