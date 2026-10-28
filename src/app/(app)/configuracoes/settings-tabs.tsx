"use client";

import { useState } from "react";

export function SettingsTabs({ tabs, defaultTab }: { tabs: Array<{ id: string; label: string; content: React.ReactNode }>; defaultTab?: string }) {
  const [active, setActive] = useState(tabs.find(tab => tab.id === defaultTab)?.id ?? tabs[0]?.id ?? "");
  return <div>
    <div className="mb-5 flex gap-2 overflow-x-auto border-b pb-px" role="tablist" aria-label="Seções das configurações">
      {tabs.map((tab) => <button key={tab.id} type="button" id={`settings-tab-${tab.id}`} role="tab" aria-controls={`settings-panel-${tab.id}`} aria-selected={active === tab.id} onClick={() => { setActive(tab.id); const url = new URL(window.location.href); url.searchParams.set("aba", tab.id); window.history.replaceState(null, "", url); }} className={`shrink-0 px-4 py-3 text-sm font-bold ${active === tab.id ? "border-b-2 border-brand text-brand" : "text-muted"}`}>{tab.label}</button>)}
    </div>
    {tabs.map((tab) => <div key={tab.id} id={`settings-panel-${tab.id}`} role="tabpanel" aria-labelledby={`settings-tab-${tab.id}`} hidden={active !== tab.id}>{tab.content}</div>)}
  </div>;
}
