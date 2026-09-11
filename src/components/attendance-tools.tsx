"use client";

import { ChevronDown, ClipboardPlus, FileHeart, Pill, Users } from "lucide-react";
import { useState, type ReactNode } from "react";

const tools = [
  { id: "receituario", label: "Receituário", icon: Pill },
  { id: "atestado", label: "Atestado Médico", icon: FileHeart },
  { id: "acompanhamento", label: "Declaração de Acompanhamento", icon: Users },
  { id: "exames", label: "Guia de Exames", icon: ClipboardPlus },
] as const;

type ToolId = (typeof tools)[number]["id"];

export function AttendanceTools({ forms }: { forms: Record<ToolId, ReactNode> }) {
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);

  return <section className="panel min-w-0" aria-labelledby="attendance-tools-title">
    <h3 id="attendance-tools-title" className="text-lg font-extrabold">Ferramentas de trabalho</h3>
    <p className="mt-1 text-sm text-muted">Selecione uma ferramenta para abrir. Clique novamente para recolher.</p>
    <div className="mt-4 flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Ferramentas de trabalho">
      {tools.map(({ id, label, icon: Icon }) => <button
        key={id}
        id={`${id}-button`}
        type="button"
        aria-expanded={activeTool === id}
        aria-controls={id}
        className={`${activeTool === id ? "primary-button" : "secondary-button"} shrink-0 gap-2 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
        onClick={() => setActiveTool((current) => current === id ? null : id)}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {label}
        <ChevronDown className={`size-4 shrink-0 transition-transform ${activeTool === id ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>)}
    </div>
    {tools.map(({ id }) => <div
      key={id}
      id={id}
      role="region"
      aria-labelledby={`${id}-button`}
      hidden={activeTool !== id}
      className="mt-4 border-t pt-4"
    >{forms[id]}</div>)}
  </section>;
}
