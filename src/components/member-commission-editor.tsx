"use client";
import { useState } from "react";
import { saveCollaboratorCommissions } from "@/actions/collaborator-commissions";
import { ActionForm } from "./action-form";
import { PaginatedCollection } from "./paginated-collection";

type Item={id:string;type:string;label:string;name:string;rate:number;individual:number|null;executionRate:number|null;executionIndividual:number|null};
export function MemberCommissionEditor({userId,items,canManage}:{userId:string;items:Item[];canManage:boolean}) {
  const [values,setValues]=useState<Record<string,string>>(()=>Object.fromEntries(items.flatMap(item=>[[`commission:${item.type}:${item.id}`,item.individual===null?"":String(item.individual/100)],[`executionCommission:${item.type}:${item.id}`,item.executionIndividual===null?"":String(item.executionIndividual/100)]])));
  const [search,setSearch]=useState("");
  return <ActionForm action={saveCollaboratorCommissions} successMessage="Comissões individuais salvas." className="grid gap-3" resetOnSuccess={false}>
    <input type="hidden" name="userId" value={userId}/>
    {Object.entries(values).map(([key,value])=><input key={key} type="hidden" name={key} value={value}/>)}
    <p className="text-sm text-muted">Em branco, herda o padrão do item. Zero desabilita aquela comissão. A comissão de execução é calculada pelo percentual do executor e pode ser dividida com assistente no atendimento.</p>
    <label className="grid gap-1 text-sm font-bold">Buscar item<input className="field" type="search" value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")e.preventDefault();}}/></label>
    <div className="grid grid-cols-[minmax(0,1fr)_110px_110px] gap-2 border-b pb-2 text-xs font-bold"><span>Item</span><span>Venda (%)</span><span>Execução (%)</span></div>
    <PaginatedCollection label="Comissões individuais" className="divide-y">{items.filter(item=>item.name.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))).map(item=><div className="grid grid-cols-[minmax(0,1fr)_110px_110px] items-start gap-2 py-2" key={`${item.type}:${item.id}`}><div className="min-w-0 text-sm font-bold">{item.name}<span className="block text-xs font-normal text-muted">{item.label}</span></div>{["commission","executionCommission"].map(kind=>{const key=`${kind}:${item.type}:${item.id}`,rate=kind==="commission"?item.rate:item.executionRate;return <div key={kind}>{rate===null?<span className="text-sm text-muted">—</span>:<><input className="field" aria-label={`${kind==="commission"?"Venda":"Execução"} de ${item.name}`} type="number" min="0" max="100" step="0.01" placeholder="Herdar" value={values[key]??""} disabled={!canManage} onChange={e=>setValues(current=>({...current,[key]:e.target.value}))}/><span className="text-xs text-muted">Padrão: {rate/100}%</span></>}</div>;})}</div>)}</PaginatedCollection>
    {canManage&&<div className="flex justify-end"><button className="primary-button">Salvar comissões</button></div>}
  </ActionForm>;
}
