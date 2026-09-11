"use client";

import { useState, type ReactNode } from "react";

export function SalesHistoryTabs({ sales, quotes, initialTab = "sales" }: { sales: ReactNode; quotes: ReactNode; initialTab?: "sales" | "quotes" }) {
  const [activeTab, setActiveTab] = useState<"sales" | "quotes">(initialTab);
  return <section className="mt-5">
    <div className="flex gap-2 border-b border-slate-200" role="tablist" aria-label="Histórico de vendas e orçamentos">
      <button type="button" role="tab" aria-selected={activeTab === "quotes"} aria-controls="historico-orcamentos" className={`${activeTab === "quotes" ? "border-brand text-brand" : "border-transparent text-muted"} border-b-2 px-4 py-3 text-sm font-extrabold transition-colors`} onClick={() => setActiveTab("quotes")}>Orçamentos de hoje</button>
      <button type="button" role="tab" aria-selected={activeTab === "sales"} aria-controls="historico-vendas" className={`${activeTab === "sales" ? "border-brand text-brand" : "border-transparent text-muted"} border-b-2 px-4 py-3 text-sm font-extrabold transition-colors`} onClick={() => setActiveTab("sales")}>Vendas de hoje</button>
    </div>
    <div id="historico-orcamentos" role="tabpanel" hidden={activeTab !== "quotes"} className="pt-1">{quotes}</div>
    <div id="historico-vendas" role="tabpanel" hidden={activeTab !== "sales"} className="pt-1">{sales}</div>
  </section>;
}
