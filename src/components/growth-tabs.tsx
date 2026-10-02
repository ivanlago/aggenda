"use client";

import { useState, type ReactNode, type KeyboardEvent } from "react";
import { CalendarClock, TicketPercent, UserRoundSearch } from "lucide-react";

const tabs = [
  { id: "retornos", label: "Retornos por procedimento", icon: CalendarClock },
  { id: "recuperacao", label: "Recuperação de pacientes", icon: UserRoundSearch },
  { id: "voucher", label: "Voucher", icon: TicketPercent },
] as const;
type TabId = (typeof tabs)[number]["id"];

export function GrowthTabs({ initialTab, panels }: { initialTab: TabId; panels: Record<TabId, ReactNode> }) {
  const [active, setActive] = useState<TabId>(initialTab);
  function select(id: TabId) {
    setActive(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    url.hash = "";
    window.history.replaceState(window.history.state, "", url);
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault(); select(tabs[next].id);
    document.getElementById(`growth-tab-${tabs[next].id}`)?.focus();
  }
  return <section className="mt-5 min-w-0">
    <div className="flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Crescimento e recorrência">
      {tabs.map(({ id, label, icon: Icon }, index) => <button key={id} id={`growth-tab-${id}`} type="button" role="tab" aria-selected={active === id} aria-controls={`growth-panel-${id}`} tabIndex={active === id ? 0 : -1}
        className={`${active === id ? "primary-button" : "secondary-button"} shrink-0 gap-2 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
        onClick={() => select(id)} onKeyDown={(event) => navigate(event, index)}><Icon className="size-4 shrink-0" aria-hidden="true" />{label}</button>)}
    </div>
    {tabs.map(({ id }) => <div key={id} id={`growth-panel-${id}`} role="tabpanel" aria-labelledby={`growth-tab-${id}`} hidden={active !== id} tabIndex={0}>{panels[id]}</div>)}
  </section>;
}
