"use client";
import { useState } from "react";
import { saveAttendanceCommissionSplit } from "@/actions/attendance-commission";
import { ActionForm } from "./action-form";

const money=(cents:number)=>(cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export function AttendanceCommissionSplitForm({appointmentId,choices,assistantId,share,amounts,locked,canManage}:{appointmentId:string;choices:{id:string;name:string}[];assistantId:string|null;share:number;amounts:number[];locked:boolean;canManage:boolean}){
  const [divide,setDivide]=useState(Boolean(assistantId)),[assistant,setAssistant]=useState(assistantId??""),[participation,setParticipation]=useState(String(share?share/100:25));
  const percentage=divide?Math.max(0,Math.min(100,Number(participation.replace(",","."))||0)):0;
  const total=amounts.reduce((sum,amount)=>sum+amount,0);
  const assistantAmount=amounts.reduce((sum,amount)=>sum+Math.round(amount*percentage/100),0);
  return <ActionForm action={saveAttendanceCommissionSplit} successMessage="Divisão de comissão salva." className="grid gap-3" resetOnSuccess={false}>
    <input type="hidden" name="appointmentId" value={appointmentId}/>
    <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="divideExecutionCommission" checked={divide} onChange={e=>setDivide(e.target.checked)} disabled={locked||!canManage}/>Dividir comissão de execução?</label>
    {divide&&<div className="grid items-end gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-bold">Assistente<select className="field" name="commissionAssistantId" required value={assistant} onChange={e=>setAssistant(e.target.value)} disabled={locked||!canManage}><option value="">Selecione</option>{choices.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="grid gap-1 text-sm font-bold">Participação do assistente (%)<input className="field" name="assistantParticipation" type="number" min="0.01" max="100" step="0.01" required value={participation} onChange={e=>setParticipation(e.target.value)} disabled={locked||!canManage}/></label></div>}
    <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg bg-brand/5 p-3 text-sm" aria-live="polite"><span>Total de execução: <strong>{money(total)}</strong></span><span>Executor ({100-percentage}%): <strong>{money(total-assistantAmount)}</strong></span>{divide&&<span>Assistente ({percentage}%): <strong>{money(assistantAmount)}</strong></span>}</div>
    <p className="text-xs text-muted">{locked?"Divisão registrada no histórico. Reabrir ou cancelar o atendimento gera os ajustes correspondentes, preservando os participantes e valores originais.":"Prévia com os valores atuais dos serviços e sessões. Salve a divisão antes de concluir o atendimento. A divisão é calculada por serviço/sessão e não altera a comissão de venda."}</p>
    {!locked&&canManage&&<div className="flex justify-end"><button className="primary-button">Salvar divisão</button></div>}
  </ActionForm>;
}
