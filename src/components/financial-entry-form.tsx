"use client";

import { useState } from "react";
import { createFinancialEntry } from "@/actions/app";
import { ActionForm } from "@/components/action-form";
import { FinancialScheduleFields } from "@/components/financial-schedule-fields";
import { FormActions, FormSection } from "@/components/form-dialog-context";
import { ModalShell } from "@/components/modal-shell";
import { ReferenceManager, ReferenceSelect } from "@/components/reference-records";
import type { ReferenceRecord } from "@/lib/reference-records";

type Props = { accounts: ReferenceRecord[]; categories: ReferenceRecord[]; costCenters: ReferenceRecord[]; today: string; initialType?: string; openReferences?: boolean };

function EntryFields({ accounts, categories, costCenters, today, initialType }: Props) {
  const [type, setType] = useState(initialType === "payable" ? "payable" : "receivable");
  const [realized, setRealized] = useState(false);
  return <ActionForm action={createFinancialEntry} successMessage="Lançamento financeiro criado." className="grid gap-5 sm:grid-cols-2" resetOnSuccess={false}>
    <p className="col-span-full text-sm text-muted">Campos com * são obrigatórios. O vencimento é independente do período do relatório.</p>
    <FormSection title="Identificação">
      <label className="grid gap-2 text-sm font-bold sm:col-span-2">Descrição *<input className="field" name="description" required placeholder="Ex.: Aluguel" /></label>
      <label className="grid gap-2 text-sm font-bold">Tipo *<select className="field" name="type" value={type} onChange={(event) => setType(event.target.value)}><option value="receivable">Conta a receber</option><option value="payable">Conta a pagar</option></select></label>
    </FormSection>
    <FormSection title="Classificação">
      <ReferenceSelect kind="financial_account" name="accountId" label="Conta / caixa" records={accounts} />
      <ReferenceSelect key={type} kind="financial_category" name="categoryId" label="Categoria" records={categories} financialType={type} />
      <ReferenceSelect kind="cost_center" name="costCenterId" label="Centro de custo" records={costCenters} />
    </FormSection>
    <FormSection title="Valores e vencimento">
      <label className="grid gap-2 text-sm font-bold">Valor (R$) *<input className="field" name="amount" inputMode="decimal" required placeholder="0,00" /></label>
      <label className="grid gap-2 text-sm font-bold">Vencimento *<input className="field" name="dueDate" type="date" required defaultValue={today} /></label>
      <FinancialScheduleFields />
      <label className="grid gap-2 text-sm font-bold">Forma de pagamento<select className="field" name="paymentMethod"><option value="">Não informada</option><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="credit_card">Cartão de crédito</option><option value="debit_card">Cartão de débito</option><option value="bank_transfer">Transferência</option><option value="boleto">Boleto</option><option value="other">Outra</option></select></label>
      <label className="flex items-center gap-2 text-sm font-bold sm:col-span-2"><input type="checkbox" name="realized" checked={realized} onChange={(event) => setRealized(event.target.checked)} />Primeiro lançamento já foi {type === "payable" ? "pago" : "recebido"}</label>
      {realized && <label className="grid gap-2 text-sm font-bold">Data da baixa *<input className="field" name="realizedDate" type="date" required defaultValue={today} /></label>}
    </FormSection>
    <FormSection title="Informações adicionais"><label className="grid gap-2 text-sm font-bold sm:col-span-2">Observações<textarea className="field min-h-20" name="notes" /></label></FormSection>
    <FormActions />
  </ActionForm>;
}

export function FinancialEntryControls(props: Props) {
  return <div className="mb-5 flex flex-wrap items-start gap-3" id="novo-lancamento">
    <ModalShell key={props.initialType ?? "new"} title="Novo lançamento" variant="new" wide closeOnSuccess defaultOpen={props.initialType === "payable" || props.initialType === "receivable"}><EntryFields {...props} /></ModalShell>
    <ReferenceManager defaultOpen={props.openReferences} title="Cadastros financeiros" groups={[{ kind: "financial_account", records: props.accounts }, { kind: "financial_category", records: props.categories }, { kind: "cost_center", records: props.costCenters }]} />
  </div>;
}
