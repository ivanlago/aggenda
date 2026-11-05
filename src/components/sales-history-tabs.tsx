"use client";

import { useState, type ReactNode } from "react";

export function SalesHistoryTabs({ sales, quotes, initialTab = "sales" }: { sales: ReactNode; quotes: ReactNode; initialTab?: "sales" | "quotes" }) {
  const [activeTab, setActiveTab] = useState<"sales" | "quotes">(initialTab);
  return <section className="mt-5">
    <div className="app-tabs" role="tablist" aria-label="Histórico de vendas e orçamentos">
      <button type="button" role="tab" aria-selected={activeTab === "quotes"} aria-controls="historico-orcamentos" className="app-tab" onClick={() => setActiveTab("quotes")}>Orçamentos de hoje</button>
      <button type="button" role="tab" aria-selected={activeTab === "sales"} aria-controls="historico-vendas" className="app-tab" onClick={() => setActiveTab("sales")}>Vendas de hoje</button>
    </div>
    <div id="historico-orcamentos" role="tabpanel" hidden={activeTab !== "quotes"} className="app-tab-content">{quotes}</div>
    <div id="historico-vendas" role="tabpanel" hidden={activeTab !== "sales"} className="app-tab-content">{sales}</div>
  </section>;
}
