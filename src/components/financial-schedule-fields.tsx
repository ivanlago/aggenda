"use client";

import { useState } from "react";

export function FinancialScheduleFields() {
  const [mode, setMode] = useState("single");
  return <>
    <label className="grid gap-1 text-sm font-bold">Repetição do lançamento
      <select className="field" value={mode} onChange={(event) => setMode(event.target.value)}>
        <option value="single">Único</option><option value="installment">Dividir o valor em parcelas</option><option value="recurring">Repetir o valor a cada mês</option>
      </select>
    </label>
    {mode === "installment" ? <label className="grid gap-1 text-sm font-bold">Número de parcelas<input className="field" name="installmentCount" type="number" min="2" max="60" defaultValue="2" required /></label> : <input type="hidden" name="installmentCount" value="1" />}
    {mode === "recurring" ? <label className="grid gap-1 text-sm font-bold">Quantidade de meses<input className="field" name="recurrenceMonths" type="number" min="2" max="60" defaultValue="2" required /></label> : <input type="hidden" name="recurrenceMonths" value="1" />}
    {mode !== "single" && <p className="text-sm text-muted">{mode === "installment" ? "O valor total será dividido entre as parcelas mensais." : "O valor informado será lançado integralmente em cada mês."} Isso cadastra compromissos financeiros; a emissão de cobranças online é feita em Cobranças.</p>}
  </>;
}
