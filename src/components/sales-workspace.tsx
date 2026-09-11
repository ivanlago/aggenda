"use client";

import { useState, type ReactNode } from "react";

export function SalesWorkspace({ sale, quote, initialMode = "sale" }: { sale: ReactNode; quote: ReactNode; initialMode?: "sale" | "quote" }) {
  const [mode, setMode] = useState(initialMode);
  return <div className="mt-5">
    <div className="mb-4 flex gap-2" role="group" aria-label="Venda e orçamento">
      <button type="button" className={mode === "sale" ? "primary-button" : "secondary-button"} aria-pressed={mode === "sale"} aria-controls="venda-form" onClick={() => setMode("sale")}>Venda</button>
      <button type="button" className={mode === "quote" ? "primary-button" : "secondary-button"} aria-pressed={mode === "quote"} aria-controls="orcamento-form" onClick={() => setMode("quote")}>Orçamento</button>
    </div>
    <div id="venda-form" hidden={mode !== "sale"}>{sale}</div>
    <div id="orcamento-form" hidden={mode !== "quote"}>{quote}</div>
  </div>;
}
