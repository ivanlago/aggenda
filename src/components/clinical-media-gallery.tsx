"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Images, PencilRuler, ScanFace } from "lucide-react";
import { createClientClinicalMedia, deleteClientClinicalMedia } from "@/actions/app";
import { ActionForm } from "@/components/action-form";
import type { SimulationShape } from "@/components/clinical-simulation-editor";

const ClinicalSimulationEditor = dynamic(() => import("@/components/clinical-simulation-editor").then((module) => module.ClinicalSimulationEditor), { ssr: false });
type MediaItem = { id: string; title: string | null; phase: string; mediaType: string; parentMediaId: string | null; annotations: Array<Record<string, unknown>>; src: string };
type SimulationSource = { src: string; title: string; parentMediaId?: string; phase: string; annotations?: Array<Record<string, unknown>> };
const phaseLabels: Record<string, string> = { before: "Antes", during: "Durante", after: "Depois", clinical: "Clínico" };
const templates: SimulationSource[] = [
  { src: "/simulator/face-front.svg", title: "Face frontal", phase: "clinical" },
  { src: "/simulator/face-profile.svg", title: "Perfil facial", phase: "clinical" },
];

export function ClinicalMediaGallery({ clientId, media, canManage }: { clientId: string; media: MediaItem[]; canManage: boolean }) {
  const router = useRouter(); const [comparison, setComparison] = useState<string[]>([]); const [split, setSplit] = useState(50);
  const [simulating, setSimulating] = useState<SimulationSource | null>(null); const [message, setMessage] = useState(""); const [pending, startTransition] = useTransition();
  const selected = comparison.map((id) => media.find((item) => item.id === id)).filter(Boolean) as MediaItem[];
  function toggleComparison(id: string) { setComparison((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current.slice(-1), id]); }
  function openMedia(item: MediaItem) { const base = item.parentMediaId ? media.find((candidate) => candidate.id === item.parentMediaId) : item; setSimulating({ src: base?.src ?? item.src, title: item.title || "Simulação", parentMediaId: item.parentMediaId ?? item.id, phase: item.phase, annotations: item.mediaType === "simulation" ? item.annotations : [] }); }
  function saveSimulation(blob: Blob, annotations: SimulationShape[]) {
    if (!simulating) return; startTransition(async () => { const formData = new FormData(); formData.set("clientId", clientId); if (simulating.parentMediaId) formData.set("parentMediaId", simulating.parentMediaId); formData.set("phase", simulating.phase); formData.set("mediaType", "simulation"); formData.set("annotations", JSON.stringify(annotations)); formData.set("title", `${simulating.title.replace(/ — simulação$/i, "")} — simulação`); formData.set("consentConfirmed", "on"); formData.set("file", new File([blob], "simulacao-procedimento.webp", { type: "image/webp" }));
      try { await createClientClinicalMedia(formData); setSimulating(null); setMessage("Simulação salva no prontuário como uma nova versão."); router.refresh(); } catch { setMessage("Não foi possível salvar a simulação."); }
    });
  }
  return <div className="mt-5">
    {canManage && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"><h3 className="flex items-center gap-2 font-extrabold"><PencilRuler size={19} /> Simulador de procedimentos</h3><p className="mt-1 text-sm text-muted">Use uma fotografia clínica ou comece por um modelo anatômico ilustrativo.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{templates.map((template) => <button key={template.src} type="button" className="flex items-center gap-3 rounded-xl border bg-white p-3 text-left font-bold hover:border-emerald-500" onClick={() => setSimulating(template)}><ScanFace className="text-brand" /> {template.title}</button>)}</div></div>}
    {selected.length === 2 && <div className="mb-5 rounded-2xl border bg-black p-3"><div className="relative mx-auto aspect-[4/3] max-w-3xl overflow-hidden rounded-xl"><Image src={selected[0].src} alt={selected[0].title || "Comparação anterior"} fill unoptimized className="object-contain" /><div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${split}%` }}><div className="relative h-full" style={{ width: `${10000 / split}%` }}><Image src={selected[1].src} alt={selected[1].title || "Comparação posterior"} fill unoptimized className="object-contain" /></div></div><div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${split}%` }} /></div><input className="mt-3 w-full accent-brand" type="range" min="5" max="95" value={split} onChange={(event) => setSplit(Number(event.target.value))} aria-label="Divisor da comparação" /></div>}
    {message && <p className="mb-3 text-sm font-bold text-brand" role="status">{message}</p>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{media.map((item) => <article key={item.id} className="rounded-2xl border p-3"><div className="relative aspect-square"><Image className="rounded-xl object-cover" src={item.src} alt={item.title || "Fotografia clínica"} fill unoptimized /></div><p className="mt-2 font-bold">{item.title || "Registro clínico"}</p><div className="mt-2 flex flex-wrap items-center gap-2"><span className="status-pill">{item.mediaType === "simulation" ? "Simulação" : phaseLabels[item.phase] ?? item.phase}</span><button type="button" className={`text-xs font-bold ${comparison.includes(item.id) ? "text-brand" : "text-muted"}`} onClick={() => toggleComparison(item.id)}><Images size={14} className="inline" /> Comparar</button>{canManage && <button type="button" className="text-xs font-bold text-brand" onClick={() => openMedia(item)}><PencilRuler size={14} className="inline" /> {item.mediaType === "simulation" ? "Continuar" : "Simular"}</button>}{canManage && <ActionForm action={deleteClientClinicalMedia} successMessage="Registro excluído."><input type="hidden" name="mediaId" value={item.id} /><button className="text-xs font-bold text-red-600">Excluir</button></ActionForm>}</div></article>)}</div>
    {!media.length && <p className="empty-state">Nenhuma fotografia ou simulação clínica registrada.</p>}
    {simulating && <ClinicalSimulationEditor source={simulating.src} initialAnnotations={simulating.annotations} saving={pending} onClose={() => setSimulating(null)} onSave={saveSimulation} />}
  </div>;
}
