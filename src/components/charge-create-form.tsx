"use client";

import { AsaasCardFees } from "@/components/asaas-card-fees";
import { PagBankInstallmentFields } from "@/components/pagbank-installment-fields";
import { onlineInstallmentRules, onlineInstallmentTerms, type OnlineInstallmentRules } from "@/lib/payment-catalog-policy";
import { PaymentMethodFields } from "@/components/payment-catalog-context";
import Link from "next/link";
import { useState } from "react";
import { createProviderCharge } from "@/actions/mercado-pago";
import { ActionForm } from "@/components/action-form";
import { ModalShell } from "@/components/modal-shell";
import { FormActions, FormSection } from "@/components/form-dialog-context";
import { PhoneInput } from "@/components/phone-input";

export type ChargeEntry = { id: string; description: string; amount: string; amountInCents?: number; dueDate: string; clientName: string; clientEmail: string; clientPhone: string };

export type ChargeProvider = "asaas" | "mercado_pago" | "pagbank" | "efi";

type Props = { entries: ChargeEntry[]; providers: ChargeProvider[]; initialEntryId?: string; defaultProvider?: ChargeProvider; onlineInstallmentPolicy?: OnlineInstallmentRules; canOverridePagBank?: boolean };

export function ChargeCreateForm({ entries, providers, initialEntryId = "", defaultProvider, onlineInstallmentPolicy, canOverridePagBank = false }: Props) {
  const [entryId, setEntryId] = useState(entries.some((entry) => entry.id === initialEntryId) ? initialEntryId : "");
  const [provider, setProvider] = useState<ChargeProvider>(defaultProvider ?? providers[0] ?? "asaas");
  const selected = entries.find((entry) => entry.id === entryId);
  const [selectedMode, setChargeMode] = useState("");
  const [paymentKind, setPaymentKind] = useState("");
  const pagBankCard = provider === "pagbank" && ["credit_card", "link"].includes(paymentKind);
  const maxInstallments = provider === "asaas" && paymentKind === "credit_card" && onlineInstallmentPolicy && selected?.amountInCents !== undefined
    ? onlineInstallmentTerms(onlineInstallmentPolicy, selected.amountInCents, provider).maximum : 24;
  const defaultInstallments = pagBankCard && onlineInstallmentPolicy && selected?.amountInCents !== undefined
    ? onlineInstallmentTerms(onlineInstallmentPolicy, selected.amountInCents, "pagbank").maximum : 1;
  const chargeMode = selectedMode || (defaultInstallments > 1 ? "installment" : "single");
  return <ActionForm action={createProviderCharge} successMessage="Cobrança criada com sucesso." className="grid gap-5 sm:grid-cols-2" resetOnSuccess={false}>
    <p className="col-span-full text-sm text-muted">Campos com * são obrigatórios.</p>

    <FormSection title="Conta a receber"><label className="grid gap-2 text-sm font-bold sm:col-span-2">Conta a receber *<select className="field" name="financialEntryId" required value={selected?.id ?? ""} onChange={(event) => setEntryId(event.target.value)}><option value="">Selecione</option>{entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.description} · {entry.amount} · {entry.dueDate}</option>)}</select></label>
    <p className="sm:col-span-2 text-sm text-muted">A cobrança oferece um meio de pagar uma conta a receber já cadastrada. A confirmação do provedor registra o recebimento automaticamente.</p>
    {!providers.length && <p className="sm:col-span-2 text-sm text-amber-800">Conecte um provedor em <Link className="font-bold text-brand" href="/configuracoes?aba=payments">Configurações de pagamento</Link> para emitir cobranças.</p>}
    <Link className="sm:col-span-2 text-sm font-bold text-brand" href="/financeiro/lancamentos?novo=receivable#novo-lancamento">Não encontrou a conta? Cadastrar conta a receber</Link>
    </FormSection>
    <FormSection title="Pagador">
      <label className="grid gap-2 text-sm font-bold">Nome do pagador *<input key={`${selected?.id ?? ""}:name`} aria-label="Nome do pagador" className="field" name="customerName" required defaultValue={selected?.clientName} placeholder="Nome do pagador" /></label>
      <label className="grid gap-2 text-sm font-bold">CPF ou CNPJ *<input key={`${selected?.id ?? ""}:document`} aria-label="CPF ou CNPJ do pagador" className="field" name="customerDocument" required inputMode="numeric" placeholder="CPF ou CNPJ" /></label>
      <label className="grid gap-2 text-sm font-bold">E-mail<input key={`${selected?.id ?? ""}:email`} aria-label="E-mail do pagador" className="field" name="customerEmail" type="email" defaultValue={selected?.clientEmail} placeholder="E-mail" /></label>
      <label className="grid gap-2 text-sm font-bold">WhatsApp<PhoneInput key={`${selected?.id ?? ""}:phone`} aria-label="WhatsApp do pagador" name="customerPhone" defaultValue={selected?.clientPhone} placeholder="WhatsApp: (71) 99999-9999" /></label>
    </FormSection>
    <FormSection title="Provedor e condições">
    <label className="grid gap-2 text-sm font-bold">Provedor de cobrança<select className="field" name="provider" value={provider} onChange={(event) => { setProvider(event.target.value as ChargeProvider); setChargeMode(""); setPaymentKind(""); }}><option value="asaas" disabled={!providers.includes("asaas")}>Asaas{providers.includes("asaas") ? "" : " · não conectado"}</option><option value="mercado_pago" disabled={!providers.includes("mercado_pago")}>Mercado Pago{providers.includes("mercado_pago") ? "" : " · não conectado"}</option><option value="pagbank" disabled={!providers.includes("pagbank")}>PagBank{providers.includes("pagbank") ? "" : " · não conectado"}</option><option value="efi" disabled={!providers.includes("efi")}>Efí Bank{providers.includes("efi") ? "" : " · não conectado"}</option></select></label>
      <PaymentMethodFields key={provider} provider={provider} onKindChange={kind => { setPaymentKind(kind); setChargeMode(""); }} />
      {(provider === "asaas" || provider === "pagbank") && <><label className="grid gap-2 text-sm font-bold">Modalidade<select className="field" name="chargeMode" value={chargeMode} onChange={(event) => setChargeMode(event.target.value)}><option value="single">Cobrança única</option>{((provider === "asaas" && maxInstallments > 1) || (pagBankCard && (defaultInstallments > 1 || canOverridePagBank))) && <option value="installment">{provider === "pagbank" ? "Cartão parcelado" : "Parcelada"}</option>}<option value="recurring">Recorrência mensal</option></select></label>{chargeMode === "installment" && provider === "asaas" && <label className="grid gap-2 text-sm font-bold">Número de parcelas<input className="field" name="installmentCount" type="number" min="2" max={maxInstallments} defaultValue="2" /></label>}</>}
      {onlineInstallmentPolicy && selected?.amountInCents !== undefined && ((provider === "mercado_pago" && ["credit_card", "link"].includes(paymentKind)) || (provider === "asaas" && paymentKind === "credit_card")) && <p className="col-span-full text-sm text-muted">Até {onlineInstallmentTerms(onlineInstallmentPolicy, selected.amountInCents, provider).maximum}× pela regra da empresa. Os custos e as condições sem juros dependem da conta no provedor.</p>}
      {provider === "asaas" && paymentKind === "credit_card" && <AsaasCardFees scope="receivable" />}
      {pagBankCard && chargeMode === "installment" && selected?.amountInCents !== undefined && <PagBankInstallmentFields key={selected.id} defaults={onlineInstallmentPolicy ?? onlineInstallmentRules()} amount={selected.amountInCents} canOverride={canOverridePagBank} scope="receivable" />}
    </FormSection>
    <p className="col-span-full text-xs text-muted">Nome, e-mail e telefone vêm do paciente vinculado. O CPF/CNPJ ainda precisa ser confirmado por segurança.</p>
    <p className="col-span-full text-xs text-muted">{provider === "mercado_pago" ? "O cliente escolherá Pix, boleto ou cartão no Checkout Pro do Mercado Pago." : provider === "pagbank" ? "O Checkout PagBank oferece Pix, boleto, cartão, parcelamento e recorrência, com baixa automática." : provider === "efi" ? "Será gerado um QR Code Pix Efí com baixa automática." : "O meio e a modalidade serão definidos na cobrança Asaas."}</p>
    <FormActions submitLabel="Gerar cobrança" disabled={!selected || !providers.length} />
  </ActionForm>;
}

export function ChargeCreateDialog(props: Props) {
  return <ModalShell key={props.initialEntryId ?? "nova"} title="Nova cobrança" variant="new" wide closeOnSuccess defaultOpen={Boolean(props.initialEntryId)}><ChargeCreateForm {...props} /></ModalShell>;
}
