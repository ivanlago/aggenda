"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function AttendanceWorkspaceTabs({ tabs }: { tabs: Array<{ id: string; label: string; content: ReactNode }> }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "overview");
  const prefix = useId(); const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const select = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (tabs.some(tab => tab.id === id)) { setActive(id); window.setTimeout(() => document.getElementById(`${prefix}-${id}-tab`)?.focus(), 0); }
    };
    window.addEventListener("aggenda:attendance-tab", select);
    return () => window.removeEventListener("aggenda:attendance-tab", select);
  }, [tabs, prefix]);
  return <div><div ref={list} className="sticky top-0 z-10 mb-5 flex gap-1 overflow-x-auto rounded-xl border bg-white p-1 shadow-sm" role="tablist" aria-label="Seções do atendimento">
    {tabs.map((tab, index) => <button type="button" key={tab.id} id={`${prefix}-${tab.id}-tab`} role="tab" aria-selected={active === tab.id} aria-controls={`${prefix}-${tab.id}-panel`} tabIndex={active === tab.id ? 0 : -1} className={`shrink-0 rounded-lg px-4 py-3 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${active === tab.id ? "bg-brand text-white" : "text-muted hover:bg-slate-50"}`} onClick={() => setActive(tab.id)} onKeyDown={event => {
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault(); setActive(tabs[next].id); list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    }}>{tab.label}</button>)}
  </div>{tabs.map(tab => <div key={tab.id} id={`${prefix}-${tab.id}-panel`} role="tabpanel" aria-labelledby={`${prefix}-${tab.id}-tab`} hidden={active !== tab.id} tabIndex={0}>{tab.content}</div>)}</div>;
}
