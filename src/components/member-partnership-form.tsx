"use client";
import { useState } from "react";
import Link from "next/link";
import { saveFiscalPartnership } from "@/actions/professional-fiscal-partnership";
import { ActionForm } from "./action-form";

export function MemberPartnershipForm({professionalId,partner}:{professionalId:string;partner?:{isActive:boolean;cnpj:string;cpf:string|null}}) {
  const [active,setActive]=useState(partner?.isActive??false);
  return <ActionForm action={saveFiscalPartnership} successMessage="Parceria atualizada." className="grid gap-3 border-b pb-4" resetOnSuccess={false}><input type="hidden" name="professionalId" value={professionalId}/><div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 font-bold"><input type="checkbox" name="active" checked={active} onChange={e=>setActive(e.target.checked)}/>Profissional parceiro</label><button className="primary-button">Salvar parceria</button></div>{active&&<><p className="text-sm text-muted">Salão Parceiro: exige enquadramento, contrato e cota-parte fiscal próprios. A comissão comercial não substitui esses requisitos.</p><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-bold">CNPJ *<input className="field" name="cnpj" defaultValue={partner?.cnpj} required/></label><label className="grid gap-1 text-sm font-bold">CPF (opcional)<input className="field" name="cpf" defaultValue={partner?.cpf??""}/></label></div><Link className="text-sm font-bold text-brand" href={`/equipe/parceria-fiscal?profissional=${professionalId}`}>Configurar cotas-partes fiscais do contrato</Link></>}</ActionForm>;
}
