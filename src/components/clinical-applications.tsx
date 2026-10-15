"use client";

import { useState } from "react";

type Application = { product: string; lot: string; expiresOn: string; quantity: string; unit: string; region: string };
const blank = (): Application => ({ product: "", lot: "", expiresOn: "", quantity: "", unit: "mL", region: "" });

export function ClinicalApplications() {
  const [rows, setRows] = useState<Application[]>([]);
  const update = (index: number, key: keyof Application, value: string) => setRows(current => current.map((row, position) => position === index ? { ...row, [key]: value } : row));
  return <fieldset className="grid gap-3 md:col-span-2"><legend className="mb-2 font-bold">Produtos aplicados e rastreabilidade</legend>
    <p className="text-xs text-muted">Registre produto, lote e validade utilizados neste paciente. Este registro não movimenta o estoque; o consumo do procedimento continua no controle de estoque existente.</p>
    <input type="hidden" name="applications" value={JSON.stringify(rows)} />
    {rows.map((row, index) => <fieldset className="grid gap-3 rounded-xl border p-3 sm:grid-cols-3" key={index}><legend className="px-1 text-sm font-bold">Aplicação {index + 1}</legend>
      {([['product', 'Produto'], ['lot', 'Lote'], ['expiresOn', 'Validade'], ['quantity', 'Quantidade'], ['region', 'Região / local']] as const).map(([key, label]) => <label key={key} className="grid gap-1 text-sm">{label}<input className="field" type={key === "expiresOn" ? "date" : "text"} inputMode={key === "quantity" ? "decimal" : undefined} required={key !== "region"} maxLength={key === "product" || key === "region" ? 200 : key === "lot" ? 100 : undefined} value={row[key]} onChange={event => update(index, key, event.target.value)} /></label>)}
      <label className="grid gap-1 text-sm">Unidade<select className="field" value={row.unit} onChange={event => update(index, "unit", event.target.value)}>{["mL", "mg", "g", "UI", "unidade"].map(unit => <option key={unit}>{unit}</option>)}</select></label>
      <button type="button" className="secondary-button w-fit" onClick={() => setRows(current => current.filter((_, position) => position !== index))}>Remover aplicação {index + 1}</button>
    </fieldset>)}
    <button type="button" className="secondary-button w-fit" disabled={rows.length >= 20} onClick={() => setRows(current => [...current, blank()])}>Adicionar produto aplicado</button>
  </fieldset>;
}
