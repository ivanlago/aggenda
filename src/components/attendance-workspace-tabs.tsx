"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function AttendanceWorkspaceTabs({ tabs, initialTab }: { tabs: Array<{ id: string; label: string; content: ReactNode }>; initialTab?: string }) {
  const [active, setActive] = useState(tabs.some(tab => tab.id === initialTab) ? initialTab! : tabs[0]?.id ?? "overview");
  const prefix = useId(); const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const select = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (tabs.some(tab => tab.id === id)) { setActive(id); window.setTimeout(() => document.getElementById(`${prefix}-${id}-tab`)?.focus(), 0); }
    };
    window.addEventListener("aggenda:attendance-tab", select);
    return () => window.removeEventListener("aggenda:attendance-tab", select);
  }, [tabs, prefix]);
  return <div><div ref={list} className="app-tabs sticky top-0 z-10 bg-white" role="tablist" aria-label="Seções do atendimento">
    {tabs.map((tab, index) => <button type="button" key={tab.id} id={`${prefix}-${tab.id}-tab`} role="tab" aria-selected={active === tab.id} aria-controls={`${prefix}-${tab.id}-panel`} tabIndex={active === tab.id ? 0 : -1} className="app-tab" onClick={() => setActive(tab.id)} onKeyDown={event => {
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault(); setActive(tabs[next].id); list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    }}>{tab.label}</button>)}
  </div>{tabs.map(tab => <div key={tab.id} id={`${prefix}-${tab.id}-panel`} className="app-tab-content" role="tabpanel" aria-labelledby={`${prefix}-${tab.id}-tab`} hidden={active !== tab.id} tabIndex={0}>{tab.content}</div>)}</div>;
}
