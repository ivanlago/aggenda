"use client";

import { useState } from "react";
import { applySaleCommissionAssessment } from "@/actions/commissions";
import { commissionAssessment, parseCommissionFee, type CommissionAssessmentLine } from "@/lib/commission-assessment";
import { ActionForm } from "@/components/action-form";
import { ModalShell } from "@/components/modal-shell";

const money=(value:number)=>(value/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export function CommissionAssessmentForm({saleId,lines,deductDiscount:initialDiscount,deductFees:initialFees,fee:initialFee,refund,locked,deductCost:initialDeductCost=false,cost:initialCost=null,recordedCost=0}:{saleId:string;lines:CommissionAssessmentLine[];deductDiscount:boolean;deductFees:boolean;fee:number|null;refund:number;locked:boolean;deductCost?:boolean;cost?:number|null;recordedCost?:number}) {
  const [discount,setDiscount]=useState(initialDiscount), [fees,setFees]=useState(initialFees);
  const [fee,setFee]=useState(initialFee===null?"":(initialFee/100).toFixed(2).replace(".",","));
  const [deductCost,setDeductCost]=useState(initialDeductCost);
  const [cost,setCost]=useState(((initialCost??recordedCost)/100).toFixed(2).replace(".",","));
  let error=""; let feeCents=0, costCents=0;
  if(fees) { try { feeCents=parseCommissionFee(fee); } catch(e) { error=(e as Error).message; } }
  if(deductCost) { try { costCents=parseCommissionFee(cost); } catch { error="Informe o custo total da venda em reais, inclusive 0,00 se não houver custo."; } }
  let rows:ReturnType<typeof commissionAssessment>=[];
  try { rows=commissionAssessment(lines,discount,feeCents,refund,costCents); } catch(e) { error=(e as Error).message; }
  return <ModalShell title={`Apurar comissão da venda #${saleId.slice(0,8)}`} variant="edit" triggerLabel="Apurar comissão" wide closeOnSuccess>
    <ActionForm action={applySaleCommissionAssessment} successMessage="Apuração aplicada às comissões de venda." className="grid gap-4">
      <input type="hidden" name="saleId" value={saleId}/>
      {locked&&<p className="text-sm text-muted">Apuração bloqueada para esta venda. Comissões pagas exigem estorno da quitação antes de revisão.</p>}
      <fieldset disabled={locked} className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="deductCost" checked={deductCost} onChange={e=>setDeductCost(e.target.checked)}/>Considerar o custo</label>
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="deductDiscount" checked={discount} onChange={e=>setDiscount(e.target.checked)}/>Considerar desconto da venda</label>
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="deductFees" checked={fees} onChange={e=>setFees(e.target.checked)}/>Considerar taxa do cartão</label>
        {deductCost&&<label className="grid w-full gap-2 text-sm font-bold">Custo total da venda (R$) *<input className="field" name="cost" value={cost} onChange={e=>setCost(e.target.value)} inputMode="decimal" required/><span className="text-xs font-normal text-muted">Confira o custo registrado no PDV ou informe o custo real. O total é rateado entre os itens pelo valor após descontos.</span></label>}
        {fees&&<label className="grid gap-2 text-sm font-bold">Taxa total da venda (R$) *<input className="field" name="fee" value={fee} onChange={e=>setFee(e.target.value)} inputMode="decimal" required placeholder="Informe a taxa real"/><span className="text-xs font-normal text-muted">Valor informado manualmente, suportado pela clínica. Rateado entre os itens pelo valor após descontos. Informe 0,00 se não houver taxa.</span></label>}
      </fieldset>
      {error&&<p role="status" className="text-sm text-amber-800">{error}</p>}
      {!error&&<div className="overflow-x-auto"><table className="w-full text-sm"><caption className="mb-3 text-left font-bold">Prévia da comissão de venda{refund>0?" · estornos proporcionais considerados":""}</caption><thead><tr>{["Item","Base original","Custo","Desconto","Taxa","Base líquida","Comissão"].map(label=><th className="p-2 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr className="border-t" key={row.id}><td className="p-2">{row.name}<span className="block text-xs text-muted">{row.rate/100}%</span></td>{[row.gross,row.cost,row.discount,row.fee,row.base,row.commission].map((value,index)=><td className="p-2 whitespace-nowrap" key={index}>{money(value)}</td>)}</tr>)}</tbody></table><p className="mt-3 font-bold">Comissão final: {money(rows.reduce((sum,row)=>sum+row.commission,0))}</p></div>}
      <p className="text-xs text-muted">As opções valem para esta venda e ficam registradas na apuração. Comissão de execução e percentuais cadastrados permanecem iguais. A prévia só altera os saldos ao aplicar.</p>
      {!locked&&<button className="primary-button justify-self-end" disabled={Boolean(error)}>Aplicar apuração</button>}
    </ActionForm>
  </ModalShell>;
}
