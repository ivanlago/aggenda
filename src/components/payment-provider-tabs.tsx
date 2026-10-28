"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";

type ProviderTab = {
  id: string;
  label: string;
  connected: boolean;
  available?: boolean;
  content: ReactNode;
};

export function PaymentProviderTabs({ tabs, defaultTab }: { tabs: ProviderTab[]; defaultTab?: string }) {
  const [group, setGroup] = useState(defaultTab?.startsWith("reconciliation-") ? "reconciliation" : "integrated");
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.id);
  const visibleTabs = tabs.filter(tab => tab.id.startsWith("reconciliation-") === (group === "reconciliation"));
  const selectedTab = visibleTabs.find((tab) => tab.id === activeTab) ?? visibleTabs[0];

  if (!selectedTab) return null;

  return (
    <section className="panel mb-5 overflow-hidden p-0">
      <div className="border-b bg-slate-50/80 p-2"><div role="group" aria-label="Modalidade de recebimento" className="mb-3 flex flex-wrap gap-2">{[["integrated", "Recebimento integrado"], ["reconciliation", "Conciliação de maquininha / extrato"]].map(([id, label]) => <button key={id} type="button" aria-pressed={group === id} className={group === id ? "primary-button" : "secondary-button"} onClick={() => setGroup(id)}>{label}</button>)}</div><p className="mb-3 text-sm text-muted">{group === "integrated" ? "Conecte uma conta para emitir cobranças e receber a confirmação do provedor." : "Confira recebimentos externos por arquivo OFX. Estas instituições não estão conectadas ao checkout."}</p>
        <div aria-label="Instituições de pagamento" className="flex gap-2 overflow-x-auto" role="tablist">
          {visibleTabs.map((tab) => {
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
                <span className={`size-2 rounded-full ${tab.connected ? "bg-emerald-500" : tab.available ? "bg-sky-500" : "bg-amber-400"}`} />
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
        <Link className="secondary-button mb-5 inline-flex gap-2" href={`/financeiro/cobrancas/guias/${selectedTab.id.replace(/^reconciliation-/, "")}`} target="_blank" rel="noopener noreferrer">
          <BookOpen className="size-4" aria-hidden="true" />Passo a passo: {selectedTab.label}<span className="sr-only"> (abre em nova aba)</span>
        </Link>
        {selectedTab.content}
      </div>
    </section>
  );
}
