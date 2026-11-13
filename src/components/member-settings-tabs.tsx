"use client";
import { useId, useState, type ReactNode } from "react";

export function MemberSettingsTabs({profile,commission,visual,professional}:{profile:ReactNode;commission:ReactNode;visual:ReactNode;professional:ReactNode}) {
  const id=useId(),[active,setActive]=useState(0);
  const tabs=[{label:"Cadastro",content:profile},{label:"Comissão",content:commission},{label:"Assinatura visual",content:visual},{label:"Assinatura profissional",content:professional}];
  return <div><div className="app-tabs" role="tablist" aria-label="Configurações do membro">{tabs.map((tab,index)=><button className="app-tab" type="button" key={tab.label} role="tab" id={`${id}-tab-${index}`} aria-selected={active===index} aria-controls={`${id}-panel-${index}`} onClick={()=>setActive(index)}>{tab.label}</button>)}</div>{tabs.map((tab,index)=><div className="app-tab-content" key={tab.label} role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`} hidden={active!==index}>{tab.content}</div>)}</div>;
}
