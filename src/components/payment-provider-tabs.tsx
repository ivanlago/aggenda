"use client";

import { useState, type ReactNode } from "react";

type ProviderTab = {
  id: string;
  label: string;
  connected: boolean;
  content: ReactNode;
};

export function PaymentProviderTabs({ tabs, defaultTab }: { tabs: ProviderTab[]; defaultTab?: string }) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.id);
  const selectedTab = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  if (!selectedTab) return null;

  return (
    <section className="panel mb-5 overflow-hidden p-0">
      <div className="border-b bg-slate-50/80 p-2">
        <div aria-label="Instituições de pagamento" className="flex gap-2 overflow-x-auto" role="tablist">
          {tabs.map((tab) => {
            const selected = tab.id === selectedTab.id;
            return (
              <button
                aria-controls={`provider-panel-${tab.id}`}
                aria-selected={selected}
                className={`flex min-w-fit items-center gap-2 rounded-xl px-4 py-3 text-sm font-extrabold transition ${selected ? "bg-white text-brand shadow-sm ring-1 ring-black/5" : "text-muted hover:bg-white/70 hover:text-foreground"}`}
                id={`provider-tab-${tab.id}`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                type="button"
              >
                <span className={`size-2 rounded-full ${tab.connected ? "bg-emerald-500" : "bg-amber-400"}`} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      <div
        aria-labelledby={`provider-tab-${selectedTab.id}`}
        className="p-5"
        id={`provider-panel-${selectedTab.id}`}
        role="tabpanel"
      >
        {selectedTab.content}
      </div>
    </section>
  );
}
