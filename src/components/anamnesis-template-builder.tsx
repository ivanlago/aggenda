"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { AnamnesisField, AnamnesisFieldType } from "@/lib/anamnesis";

const labels: Record<AnamnesisFieldType, string> = { short_text: "Texto curto", long_text: "Texto longo", number: "Número", date: "Data", yes_no: "Sim ou não", single_choice: "Escolha única", multiple_choice: "Múltipla escolha" };
const createField = (index: number): AnamnesisField => ({ id: `question_${Date.now()}_${index}`, label: "", type: "short_text", required: false });

export function AnamnesisTemplateBuilder({ services }: { services: Array<{ id: string; name: string; shortName: string | null }> }) {
  const [fields, setFields] = useState<AnamnesisField[]>([createField(0)]);
  const update = (index: number, patch: Partial<AnamnesisField>) => setFields((current) => current.map((field, position) => position === index ? { ...field, ...patch } : field));
  return <>
    <input type="hidden" name="responseSchema" value={JSON.stringify(fields)} />
    <input className="field" name="name" required maxLength={120} placeholder="Nome do modelo, ex.: Anamnese para microagulhamento" />
    <select className="field" name="serviceId" defaultValue=""><option value="">Todos os procedimentos</option>{services.map((service) => <option key={service.id} value={service.id}>{service.shortName || service.name}</option>)}</select>
    <div className="grid gap-3">{fields.map((field, index) => <article className="rounded-2xl border bg-slate-50 p-3" key={field.id}>
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_auto]">
        <input className="field" value={field.label} onChange={(event) => update(index, { label: event.target.value })} placeholder={`Pergunta ${index + 1}`} aria-label={`Texto da pergunta ${index + 1}`} />
        <select className="field" value={field.type} onChange={(event) => update(index, { type: event.target.value as AnamnesisFieldType, options: ["single_choice", "multiple_choice"].includes(event.target.value) ? field.options ?? [] : undefined })}>{Object.entries(labels).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select>
        <button className="rounded-xl p-3 text-red-700 hover:bg-red-50" type="button" onClick={() => setFields((current) => current.filter((_, position) => position !== index))} disabled={fields.length === 1} aria-label={`Remover pergunta ${index + 1}`}><Trash2 className="size-4" /></button>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs font-bold"><label className="flex items-center gap-2"><input type="checkbox" checked={field.required ?? false} onChange={(event) => update(index, { required: event.target.checked })} />Obrigatória</label>{field.type === "yes_no" ? <label className="flex items-center gap-2"><input type="checkbox" checked={field.alertWhen === "Sim"} onChange={(event) => update(index, { alertWhen: event.target.checked ? "Sim" : undefined })} />Alertar quando a resposta for Sim</label> : null}</div>
      {["single_choice", "multiple_choice"].includes(field.type) ? <input className="field mt-2" value={field.options?.join("; ") ?? ""} onChange={(event) => update(index, { options: event.target.value.split(";").map((option) => option.trim()).filter(Boolean) })} placeholder="Opções separadas por ponto e vírgula" /> : null}
    </article>)}</div>
    <button className="secondary-button w-fit" type="button" onClick={() => setFields((current) => [...current, createField(current.length)])}><Plus className="mr-2 size-4" />Adicionar pergunta</button>
  </>;
}
