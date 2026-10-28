"use client";

import Link from "next/link";
import { useState } from "react";
import { createProviderCharge } from "@/actions/mercado-pago";
import { ActionForm } from "@/components/action-form";
import { PhoneInput } from "@/components/phone-input";

type Entry = { id: string; description: string; amount: string; dueDate: string; clientName: string; clientEmail: string; clientPhone: string };

type Provider = "asaas" | "mercado_pago" | "pagbank" | "efi";

export function ChargeCreateForm({ entries, providers, initialEntryId = "" }: { entries: Entry[]; providers: Provider[]; initialEntryId?: string }) {
  const [entryId, setEntryId] = useState(entries.some((entry) => entry.id === initialEntryId) ? initialEntryId : "");
  const [provider, setProvider] = useState<Provider>(providers[0] ?? "asaas");
  const selected = entries.find((entry) => entry.id === entryId);
  const [chargeMode, setChargeMode] = useState("single");
  return <ActionForm action={createProviderCharge} successMessage="Cobrança criada com sucesso." className="grid gap-3">
    <label className="grid gap-1 text-xs font-bold">Provedor de cobrança<select className="field" name="provider" value={provider} onChange={(event) => setProvider(event.target.value as Provider)}><option value="asaas" disabled={!providers.includes("asaas")}>Asaas{providers.includes("asaas") ? "" : " · não conectado"}</option><option value="mercado_pago" disabled={!providers.includes("mercado_pago")}>Mercado Pago{providers.includes("mercado_pago") ? "" : " · não conectado"}</option><option value="pagbank" disabled={!providers.includes("pagbank")}>PagBank{providers.includes("pagbank") ? "" : " · não conectado"}</option><option value="efi" disabled={!providers.includes("efi")}>Efí Bank{providers.includes("efi") ? "" : " · não conectado"}</option></select></label>
    <label className="grid gap-1 text-xs font-bold">Conta a receber<select className="field" name="financialEntryId" required value={selected?.id ?? ""} onChange={(event) => setEntryId(event.target.value)}><option value="">Selecione</option>{entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.description} · {entry.amount} · {entry.dueDate}</option>)}</select></label>
    <p className="text-sm text-muted">A cobrança oferece um meio de pagar uma conta a receber já cadastrada. A confirmação do provedor registra o recebimento automaticamente.</p>
    {!providers.length && <p className="text-sm text-amber-800">Conecte um provedor em <Link className="font-bold text-brand" href="/configuracoes?aba=payments">Configurações de pagamento</Link> para emitir cobranças.</p>}
    <Link className="text-sm font-bold text-brand" href="/financeiro?novo=receivable#novo-lancamento">Não encontrou a conta? Cadastrar conta a receber</Link>
    <div className="grid gap-3 md:grid-cols-2">
      <input key={`${selected?.id ?? ""}:name`} aria-label="Nome do pagador" className="field" name="customerName" required defaultValue={selected?.clientName} placeholder="Nome do pagador" />
      <input key={`${selected?.id ?? ""}:document`} aria-label="CPF ou CNPJ do pagador" className="field" name="customerDocument" required inputMode="numeric" placeholder="CPF ou CNPJ" />
      <input key={`${selected?.id ?? ""}:email`} aria-label="E-mail do pagador" className="field" name="customerEmail" type="email" defaultValue={selected?.clientEmail} placeholder="E-mail" />
      <PhoneInput key={`${selected?.id ?? ""}:phone`} aria-label="WhatsApp do pagador" name="customerPhone" defaultValue={selected?.clientPhone} placeholder="WhatsApp: (71) 99999-9999" />
      {(provider === "asaas" || provider === "pagbank") && <><label className="grid gap-1 text-xs font-bold">Meio<select className="field" name="paymentMethod" key={provider} defaultValue={provider === "pagbank" ? "link" : "pix"}><option value="pix">Pix</option><option value="boleto">Boleto</option><option value="link">Link com escolha do cliente</option><option value="credit_card">Cartão de crédito</option></select></label><label className="grid gap-1 text-xs font-bold">Modalidade<select className="field" name="chargeMode" value={chargeMode} onChange={(event) => setChargeMode(event.target.value)}><option value="single">Cobrança única</option><option value="installment">Parcelada</option><option value="recurring">Recorrência mensal</option></select></label>{chargeMode === "installment" && <label className="grid gap-1 text-xs font-bold">Número de parcelas<input className="field" name="installmentCount" type="number" min="2" max={provider === "pagbank" ? 12 : 24} defaultValue="2" /></label>}</>}
    </div>
    <p className="text-xs text-muted">Nome, e-mail e telefone vêm do paciente vinculado. O CPF/CNPJ ainda precisa ser confirmado por segurança.</p>
    <p className="text-xs text-muted">{provider === "mercado_pago" ? "O cliente escolherá Pix, boleto ou cartão no Checkout Pro do Mercado Pago." : provider === "pagbank" ? "O Checkout PagBank oferece Pix, boleto, cartão, parcelamento e recorrência, com baixa automática." : provider === "efi" ? "Será gerado um QR Code Pix Efí com baixa automática." : "O meio e a modalidade serão definidos na cobrança Asaas."}</p>
    <button className="primary-button sm:w-fit" disabled={!selected || !providers.length}>Gerar cobrança</button>
  </ActionForm>;
}
