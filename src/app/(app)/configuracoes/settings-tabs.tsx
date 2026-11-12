"use client";

import { useState } from "react";

export function SettingsTabs({ tabs, defaultTab, queryParam = "aba", idPrefix = "settings", label = "Seções das configurações" }: { tabs: Array<{ id: string; label: string; content: React.ReactNode }>; defaultTab?: string; queryParam?: string; idPrefix?: string; label?: string }) {
  const [active, setActive] = useState(tabs.find(tab => tab.id === defaultTab)?.id ?? tabs[0]?.id ?? "");
  return <div>
    <div className="app-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => <button key={tab.id} type="button" id={`${idPrefix}-tab-${tab.id}`} role="tab" aria-controls={`${idPrefix}-panel-${tab.id}`} aria-selected={active === tab.id} onClick={() => { setActive(tab.id); const url = new URL(window.location.href); url.searchParams.set(queryParam, tab.id); window.history.replaceState(null, "", url); }} className="app-tab">{tab.label}</button>)}
    </div>
    {tabs.map((tab) => <div key={tab.id} id={`${idPrefix}-panel-${tab.id}`} className="app-tab-content" role="tabpanel" aria-labelledby={`${idPrefix}-tab-${tab.id}`} hidden={active !== tab.id}>{tab.content}</div>)}
  </div>;
}
