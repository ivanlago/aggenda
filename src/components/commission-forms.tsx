import { FormActions } from "@/components/form-dialog-context";
import { randomUUID } from "node:crypto";
import { payCommissions, saveCommissionRule } from "@/actions/commissions";
import type { CommissionBeneficiaryOption } from "@/lib/commission-beneficiary";
import { ActionForm } from "./action-form";
import { ModalShell } from "./modal-shell";

export const commissionMoney=(value:number)=>(value/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export function CommissionBeneficiarySelect({choices}:{choices:CommissionBeneficiaryOption[]}) {
  return <label className="grid gap-2 text-sm font-bold">Beneficiário<select className="field" name="beneficiary" required defaultValue=""><option value="">Selecione</option>{choices.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>;
}
export function CommissionRuleForm({choices,services,variants}:{choices:CommissionBeneficiaryOption[];services:Array<{id:string;name:string}>;variants:Array<{id:string;name:string}>}) {
  return <ActionForm action={saveCommissionRule} successMessage="Regra criada. Atualize os cálculos." className="mt-4 grid gap-3 sm:grid-cols-2">
    <CommissionBeneficiarySelect choices={choices}/>
    <label className="grid gap-2 text-sm font-bold">Origem<select className="field" name="sourceType"><option value="appointment">Atendimento realizado (inclui sessões de pacote)</option><option value="product">Produto vendido</option><option value="service">Procedimento vendido diretamente no PDV</option></select></label>
    <label className="grid gap-2 text-sm font-bold">Procedimento (atendimento ou PDV)<select className="field" name="serviceId"><option value="">Todos</option>{services.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label className="grid gap-2 text-sm font-bold">Produto/variação (produtos)<select className="field" name="variantId"><option value="">Todos</option>{variants.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label className="grid gap-2 text-sm font-bold">Liberar comissão do atendimento<select className="field" name="trigger"><option value="completed_appointment">Quando concluir o atendimento</option><option value="received">Quando concluir e receber integralmente</option></select></label>
    <label className="grid gap-2 text-sm font-bold">Cálculo<select className="field" name="calculationType"><option value="percentage">Percentual sobre valor líquido</option><option value="fixed">Valor fixo por unidade/sessão</option></select></label>
    <label className="grid gap-2 text-sm font-bold">Percentual (%) ou valor (R$)<input className="field" name="value" required inputMode="decimal" placeholder="Ex.: 10 ou 25,00"/></label>
    <p className="text-xs text-muted">Regra específica prevalece sobre geral; entre iguais, vale a mais recente. Lançamentos calculados preservam a regra original. Produtos sem regra usam o percentual da variação. Vendas no PDV liberam comissão após recebimento.</p>
    <button className="primary-button w-fit">Criar regra</button>
  </ActionForm>;
}
export function CommissionPaymentForm({beneficiary,label,amount,accounts,today,entryId}:{beneficiary:string;label:string;amount:number;accounts:Array<{id:string;name:string}>;today:string;entryId?:string}) {
  return <ModalShell title={`Registrar quitação${entryId?" individual":" do saldo"}`} variant="payment">
    <p className="text-sm">{label} · <strong>{commissionMoney(amount)}</strong></p>
    <p className="text-sm text-muted">Registre um pagamento já realizado. A ação gera a saída no financeiro e preserva o histórico; não faz transferência bancária. Ajustes negativos pendentes serão compensados.</p>
    <ActionForm action={payCommissions} successMessage="Quitação registrada no financeiro." className="mt-4 grid gap-3">
      <input type="hidden" name="beneficiary" value={beneficiary}/><input type="hidden" name="requestKey" value={randomUUID()}/><input type="hidden" name="expectedAmount" value={amount}/>{entryId&&<input type="hidden" name="entryId" value={entryId}/>}
      <label className="grid gap-2 text-sm font-bold">Data do pagamento<input className="field" type="date" name="paidOn" required max={today} defaultValue={today}/></label>
      <label className="grid gap-2 text-sm font-bold">Conta de saída<select className="field" name="accountId" required defaultValue=""><option value="">Selecione</option>{accounts.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {!accounts.length&&<p className="text-sm text-amber-800">Cadastre uma conta ativa no financeiro antes de quitar.</p>}
      <label className="grid gap-2 text-sm font-bold">Forma de pagamento<select className="field" name="method"><option value="pix">Pix</option><option value="bank_transfer">Transferência</option><option value="cash">Dinheiro</option><option value="other">Outra</option></select></label>
      <label className="grid gap-2 text-sm font-bold">Observação ou referência do comprovante<textarea className="field" name="notes" maxLength={2000}/></label>
      <FormActions disabled={!accounts.length} submitLabel={`Registrar ${commissionMoney(amount)} como pagos`} />
    </ActionForm>
  </ModalShell>;
}
