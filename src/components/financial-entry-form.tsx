"use client";
import { PaymentMethodFields, usePaymentCatalog } from "@/components/payment-catalog-context";

import { useRef, useState } from "react";
import Link from "next/link";
import { createFinancialEntry, prepareReceivableCharges } from "@/actions/app";
import { createProviderCharge } from "@/actions/mercado-pago";
import { ActionForm } from "@/components/action-form";
import { FinancialScheduleFields } from "@/components/financial-schedule-fields";
import { FormActions, FormSection, useFormDialog } from "@/components/form-dialog-context";
import { ModalShell } from "@/components/modal-shell";
import { ReferenceSelect } from "@/components/reference-records";
import type { ReferenceRecord } from "@/lib/reference-records";
import type { receivableChargeOptions } from "@/lib/receivable-charge-options";
import { paymentKindSupported } from "@/lib/payment-catalog-policy";
import { onlineChargesPath } from "@/lib/finance-navigation";
import { PhoneInput } from "@/components/phone-input";
import { financialDueDate } from "@/lib/financial-schedule";

type Provider = Awaited<ReturnType<typeof receivableChargeOptions>>[number];
type Props = { categories: ReferenceRecord[]; today: string; initialType?: string; autoOpen?: boolean; providers?: Provider[] };
type IssuanceResult = { id: string; description: string; chargeId?: string; error?: string };

function EntryFields({ categories, today, initialType, providers = [] }: Props) {
  const dialog = useFormDialog();
  const { methods, accounts } = usePaymentCatalog();
  const [type, setType] = useState(initialType === "payable" ? "payable" : "receivable");
  const [realized, setRealized] = useState(false);
  const [withCharge, setWithCharge] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [count, setCount] = useState(1);
  const [dueDate, setDueDate] = useState(today);
  const [omitted, setOmitted] = useState<number[]>([]);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<IssuanceResult[] | null>(null);
  const requestId = useRef<string | null>(null);
  const completed = useRef<IssuanceResult[] | null>(null);
  const compatibleMethods = methods.filter(method => paymentKindSupported(method.kind, method.provider) && accounts.some(account => account.id === method.defaultAccountId));
  const eligible = providers.filter(provider => compatibleMethods.some(method => method.provider === provider.id));
  const provider = eligible.find(item => item.id === selectedProvider) ?? eligible.find(item => item.isDefault) ?? eligible[0];
  const emit = type === "receivable" && !realized && withCharge && Boolean(provider);
  const installments = Array.from({ length: Number.isInteger(count) && count > 0 && count <= 60 ? count : 0 }, (_, i) => i + 1);

  if (result) return <div className="grid gap-4">
    <p role="status" className="font-bold">Contas salvas. {result.filter(item => !item.error).length} de {result.length} cobranças emitidas.</p>
    <ul className="divide-y">{result.map(item => <li className="flex flex-wrap items-center justify-between gap-3 py-3" key={item.id}>
      <div><p className="font-bold">{item.description}</p><p className="text-sm text-muted">{item.error ?? "Cobrança emitida"}</p></div>
      <Link className="secondary-button" href={onlineChargesPath + (item.chargeId ? "&cobranca=" + item.chargeId : "&lancamento=" + item.id + "#nova-cobranca")} onClick={dialog.close}>{item.chargeId ? "Ver cobrança" : "Tentar emissão individual"}</Link>
    </li>)}</ul>
    <button type="button" className="primary-button justify-self-end" onClick={dialog.close}>Concluir</button>
  </div>;

  async function save(data: FormData) {
    if (!emit || data.get("submitIntent") === "save") {
      if (requestId.current) return { error: "Confira o lançamento em Contas a receber antes de salvá-lo novamente." };
      return createFinancialEntry(data);
    }
    requestId.current ??= crypto.randomUUID();
    data.set("chargeRequestId", requestId.current);
    const prepared = await prepareReceivableCharges(data);
    if (!prepared.entries) {
      if (!prepared.mayHaveSaved) requestId.current = null;
      return { error: prepared.error ?? "Não foi possível salvar as contas." };
    }
    const issued: IssuanceResult[] = [];
    for (const entry of prepared.entries) {
      setProgress(`Emitindo cobrança ${issued.length + 1} de ${prepared.entries.length}…`);
      const charge = new FormData();
      charge.set("provider", String(data.get("chargeProvider")));
      charge.set("paymentMethod", String(data.get("chargePaymentMethod")));
      charge.set("financialEntryId", entry.id);
      charge.set("chargeMode", "single");
      for (const key of ["customerName", "customerDocument", "customerEmail", "customerPhone"]) charge.set(key, String(data.get(key) ?? ""));
      try {
        const response = await createProviderCharge(charge);
        issued.push({
          id: entry.id, description: entry.description,
          chargeId: "chargeId" in response ? response.chargeId : undefined,
          error: "error" in response ? response.error : undefined,
        });
      } catch {
        issued.push({ id: entry.id, description: entry.description, error: "Confira a situação da parcela antes de tentar novamente." });
      }
    }
    setProgress("");
    completed.current = issued;
    return { warning: "Contas salvas. Confira o resultado das cobranças." };
  }

  return <ActionForm action={save} onSuccess={() => {
    if (completed.current) setResult(completed.current);
    else dialog.close();
  }} successMessage="Lançamento financeiro criado." className="grid gap-5 sm:grid-cols-2" resetOnSuccess={false}>
    <p className="col-span-full text-sm text-muted">Campos com * são obrigatórios. O vencimento é independente do período do relatório.</p>
    <FormSection title="Identificação">
      <label className="grid gap-2 text-sm font-bold sm:col-span-2">Descrição (opcional)<input className="field" name="description" placeholder="Se ficar em branco, usaremos o nome da categoria" /></label>
      <label className="grid gap-2 text-sm font-bold">Tipo *<select className="field" name="type" value={type} onChange={(event) => setType(event.target.value)}><option value="receivable">Conta a receber</option><option value="payable">Conta a pagar</option></select></label>
    </FormSection>
    <FormSection title="Classificação">
      <ReferenceSelect key={type} kind="financial_category" name="categoryId" label="Categoria" records={categories} financialType={type} />
    </FormSection>
    <FormSection title="Valores e vencimento">
      <label className="grid gap-2 text-sm font-bold">Valor (R$) *<input className="field" name="amount" inputMode="decimal" required placeholder="0,00" /></label>
      <label className="grid gap-2 text-sm font-bold">Vencimento *<input className="field" name="dueDate" type="date" required value={dueDate} onChange={event => setDueDate(event.target.value)} /></label>
      <FinancialScheduleFields onCountChange={value => { setCount(value); setOmitted([]); }} />
      {!emit && <PaymentMethodFields required={realized} />}
      <label className="flex items-center gap-2 text-sm font-bold sm:col-span-2"><input type="checkbox" name="realized" checked={realized} onChange={(event) => setRealized(event.target.checked)} />Primeiro lançamento já foi {type === "payable" ? "pago" : "recebido"}</label>
      {realized && <label className="grid gap-2 text-sm font-bold">Data da baixa *<input className="field" name="realizedDate" type="date" required defaultValue={today} /></label>}
    </FormSection>
    {type === "receivable" && <FormSection title="Cobrança online">
      <label className="col-span-full flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={emit} disabled={realized || !provider} onChange={event => setWithCharge(event.target.checked)} />Emitir cobrança online</label>
      {realized ? <p className="col-span-full text-sm text-muted">Desmarque “Primeiro lançamento já foi recebido” para emitir cobrança pelo formulário.</p>
        : !providers.length ? <p className="col-span-full text-sm text-muted">Conecte e valide um provedor em <Link className="font-bold text-brand underline" href="/configuracoes?aba=payments">Provedores de pagamento</Link> para liberar a emissão.</p>
          : !provider ? <p className="col-span-full text-sm text-muted">Provedores ativos: {providers.map(item => item.name).join(", ")}. Em <Link className="font-bold text-brand underline" href="/financeiro/formas-de-pagamento">Formas de pagamento</Link>, vincule uma forma ativa e compatível a um desses provedores e selecione uma conta de destino ativa.</p>
            : !emit && <p className="col-span-full text-sm text-muted">Marque a opção acima para informar o pagador e escolher as parcelas que deseja cobrar.</p>}
      {!realized && provider && <label className="grid gap-2 text-sm font-bold">Provedor<select className="field" name="chargeProvider" value={provider.id} onChange={event => setSelectedProvider(event.target.value)}>{eligible.map(item => <option key={item.id} value={item.id}>{item.name}{item.environment === "sandbox" ? " (testes)" : ""}</option>)}</select></label>}
      {emit && provider && <>
        <label className="grid gap-2 text-sm font-bold">Forma de pagamento *<select key={provider.id} className="field" name="chargePaymentMethod" required><option value="">Selecione</option>{compatibleMethods.filter(method => method.provider === provider.id).map(method => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-bold">Nome do pagador *<input className="field" name="customerName" required minLength={2} /></label>
        <label className="grid gap-2 text-sm font-bold">CPF ou CNPJ{provider.id !== "mercado_pago" && " *"}<input className="field" name="customerDocument" inputMode="numeric" required={provider.id !== "mercado_pago"} /></label>
        <label className="grid gap-2 text-sm font-bold">E-mail<input className="field" name="customerEmail" type="email" /></label>
        <label className="grid gap-2 text-sm font-bold">WhatsApp<PhoneInput name="customerPhone" /></label>
        {installments.length === 1 ? <input type="hidden" name="chargeInstallment" value="1" /> : <fieldset className="col-span-full grid gap-2"><legend className="mb-2 text-sm font-bold">Parcelas a cobrar</legend>
          <div className="grid max-h-36 grid-cols-2 gap-2 overflow-auto sm:grid-cols-3">{installments.map(index => <label key={index} className="flex items-center gap-2 text-sm"><input type="checkbox" name="chargeInstallment" value={index} checked={!omitted.includes(index)} onChange={event => setOmitted(current => event.target.checked ? current.filter(item => item !== index) : [...current, index])} />Parcela {index}{/^\d{4}-\d{2}-\d{2}$/.test(dueDate) && " · " + financialDueDate(dueDate, index - 1).split("-").reverse().join("/")}</label>)}</div>
        </fieldset>}
        {progress && <p role="status" className="col-span-full text-sm text-brand">{progress}</p>}
      </>}
    </FormSection>}
    <FormSection title="Informações adicionais"><label className="grid gap-2 text-sm font-bold sm:col-span-2">Observações<textarea className="field min-h-20" name="notes" /></label></FormSection>
    <FormActions submitLabel={type === "receivable" ? (emit ? "Salvar e emitir cobranças" : "Salvar conta") : undefined}
      extraActions={type === "receivable" && (emit
        ? <button type="submit" name="submitIntent" value="save" formNoValidate className="secondary-button">Salvar conta</button>
        : <button type="button" className="secondary-button" disabled>Salvar e emitir cobranças</button>)}
      disabled={emit && !installments.some(index => !omitted.includes(index))} />
  </ActionForm>;
}

export function FinancialEntryControls(props: Props) {
  return <div className="flex flex-wrap items-start gap-3" id="novo-lancamento">
    <ModalShell key={props.initialType ?? "new"} title={props.initialType === "payable" ? "Nova conta a pagar" : "Nova conta a receber"} variant="new" wide defaultOpen={props.autoOpen}><EntryFields {...props} /></ModalShell>
  </div>;
}
