"use client";
import { ChevronDown, ClipboardPlus, FileHeart, Pill, ScrollText, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
const tools = [
 { id: "anamnesis", label: "Anamnese", icon: ScrollText },
 { id: "certificate", label: "Atestado Médico", icon: FileHeart },
 { id: "companion_declaration", label: "Declaração de acompanhante", icon: Users },
 { id: "prescription", label: "Receituário", icon: Pill },
 { id: "exam_request", label: "Solicitação de Exames", icon: ClipboardPlus },
] as const;
type ToolId = (typeof tools)[number]["id"];
export function ClinicalDocumentTools({ forms }: { forms: Record<ToolId, ReactNode> }) {
 const [activeTool, setActiveTool] = useState<ToolId | null>(null);
 return <section className="panel min-w-0" aria-labelledby="clinical-tools-title">
 <h2 id="clinical-tools-title" className="text-lg font-extrabold">Documentos clínicos</h2>
 <div className="mt-4 flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Documentos clínicos">
 {tools.map(({ id, label, icon: Icon }) => <button key={id} id={`clinical-${id}-button`} type="button" aria-expanded={activeTool === id} aria-controls={`clinical-${id}`} className={`${activeTool === id ? "primary-button" : "secondary-button"} shrink-0 gap-2 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`} onClick={() => setActiveTool(current => current === id ? null : id)}><Icon className="size-4 shrink-0" aria-hidden="true" />{label}<ChevronDown className={`size-4 shrink-0 transition-transform ${activeTool === id ? "rotate-180" : ""}`} aria-hidden="true" /></button>)}
 </div>
 {tools.map(({ id }) => <div key={id} id={`clinical-${id}`} role="region" aria-labelledby={`clinical-${id}-button`} hidden={activeTool !== id} className="mt-4 border-t pt-4">{forms[id]}</div>)}
 </section>;
}
