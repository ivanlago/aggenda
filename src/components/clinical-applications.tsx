"use client";

import { useState } from "react";

export type Application = { lotId?: string; product: string; lot: string; expiresOn: string; quantity: string; unit: "mL" | "mg" | "g" | "UI" | "unidade"; region: string };
export type ClinicalLotOption = { id: string; product: string; code: string; expiresOn: string; unit: Application["unit"]; available: number };
const blank = (): Application => ({ product: "", lot: "", expiresOn: "", quantity: "", unit: "mL", region: "" });

export function ClinicalApplications({ value, onChange, lots = [] }: { value?: Application[]; onChange?: (value: Application[]) => void; lots?: ClinicalLotOption[] }) {
  const [internalRows, setInternalRows] = useState<Application[]>([]);
  const rows = value ?? internalRows;
  const setRows = (update: (current: Application[]) => Application[]) => { const next = update(rows); if (onChange) onChange(next); else setInternalRows(next); };
  const update = (index: number, key: keyof Application, value: string) => setRows(current => current.map((row, position) => position === index ? { ...row, [key]: value } as Application : row));
  return <fieldset className="grid gap-3 md:col-span-2"><legend className="mb-2 font-bold">Produtos aplicados e rastreabilidade</legend>
    <p className="text-xs text-muted">Selecione o lote realmente utilizado. Ao finalizar o registro, a quantidade é baixada do estoque e vinculada ao paciente. A conclusão do atendimento desconta apenas o restante da ficha técnica. Não há conversão automática de unidades.</p>
    {!lots.length && <p className="text-sm text-amber-800">Nenhum lote disponível. Cadastre o produto na unidade aplicada, registre seus lotes e ative o controle em Estoque → Lotes e recolhimentos.</p>}
    <input type="hidden" name="applications" value={JSON.stringify(rows)} />
    {rows.map((row, index) => <fieldset className="grid gap-3 rounded-xl border p-3 sm:grid-cols-3" key={index}><legend className="px-1 text-sm font-bold">Aplicação {index + 1}</legend>
      <label className="grid gap-1 text-sm sm:col-span-3">Produto e lote disponível<select className="field" value={row.lotId ?? ""} required onChange={event => { const lot = lots.find(item => item.id === event.target.value); if (lot) setRows(current => current.map((item, position) => position === index ? { ...item, lotId: lot.id, product: lot.product, lot: lot.code, expiresOn: lot.expiresOn, unit: lot.unit } : item)); }}><option value="">Selecione o lote utilizado</option>{row.lotId && !lots.some(lot => lot.id === row.lotId) && <option value={row.lotId} disabled>Lote salvo indisponível — selecione outro</option>}{lots.map(lot => <option key={lot.id} value={lot.id}>{lot.product} · {lot.code} · validade {lot.expiresOn.split("-").reverse().join("/")} · disponível {lot.available / 1000} {lot.unit}</option>)}</select></label>
      {([['product', 'Produto'], ['lot', 'Lote'], ['expiresOn', 'Validade'], ['quantity', 'Quantidade'], ['region', 'Região / local']] as const).map(([key, label]) => <label key={key} className="grid gap-1 text-sm">{label}<input className="field" type={key === "expiresOn" ? "date" : "text"} readOnly={["product", "lot", "expiresOn"].includes(key)} inputMode={key === "quantity" ? "decimal" : undefined} required={key !== "region"} maxLength={key === "product" || key === "region" ? 200 : key === "lot" ? 100 : undefined} value={row[key]} onChange={event => update(index, key, event.target.value)} /></label>)}
      <label className="grid gap-1 text-sm">Unidade<input className="field" value={row.unit} readOnly /></label>
      <button type="button" className="secondary-button w-fit" onClick={() => setRows(current => current.filter((_, position) => position !== index))}>Remover aplicação {index + 1}</button>
    </fieldset>)}
    <button type="button" className="secondary-button w-fit" disabled={rows.length >= 20} onClick={() => setRows(current => [...current, blank()])}>Adicionar produto aplicado</button>
  </fieldset>;
}
