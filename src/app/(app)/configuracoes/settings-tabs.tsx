"use client";

import { useState } from "react";

export function SettingsTabs({ tabs }: { tabs: Array<{ id: string; label: string; content: React.ReactNode }> }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  return <div>
    <div className="mb-5 flex gap-2 overflow-x-auto border-b pb-px" role="tablist" aria-label="Seções das configurações">
      {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={active === tab.id} onClick={() => setActive(tab.id)} className={`shrink-0 px-4 py-3 text-sm font-bold ${active === tab.id ? "border-b-2 border-brand text-brand" : "text-muted"}`}>{tab.label}</button>)}
    </div>
    {tabs.map((tab) => <div key={tab.id} role="tabpanel" hidden={active !== tab.id}>{tab.content}</div>)}
  </div>;
}
