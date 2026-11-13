"use client";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

export function MemberSettingsTabs({ profile, commission, partnership, visual, professional }: { profile: ReactNode; commission: ReactNode; partnership: ReactNode; visual: ReactNode; professional: ReactNode }) {
  const id = useId();
  const [active, setActive] = useState(0);
  const tabs = [{ label: "Cadastro", content: profile }, { label: "Comissão", content: commission }, { label: "Profissional parceiro", content: partnership }, { label: "Assinatura visual", content: visual }, { label: "Assinatura profissional", content: professional }];
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }
  return <div>
    <div className="app-tabs" role="tablist" aria-label="Configurações do membro">{tabs.map((tab, index) => <button className="app-tab" type="button" key={tab.label} role="tab" id={`${id}-tab-${index}`} tabIndex={active === index ? 0 : -1} aria-selected={active === index} aria-controls={`${id}-panel-${index}`} onClick={() => setActive(index)} onKeyDown={event => navigate(event, index)}>{tab.label}</button>)}</div>
    {tabs.map((tab, index) => <div className="app-tab-content" key={tab.label} role="tabpanel" id={`${id}-panel-${index}`} aria-labelledby={`${id}-tab-${index}`} hidden={active !== index}>{tab.content}</div>)}
  </div>;
}
