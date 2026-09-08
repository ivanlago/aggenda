"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Images, PencilRuler, Trash2 } from "lucide-react";
import { createClientClinicalMedia, deleteClientClinicalMedia } from "@/actions/app";
import { ActionForm } from "@/components/action-form";
import type { SimulationShape } from "@/components/clinical-simulation-editor";

const ClinicalSimulationEditor = dynamic(() => import("@/components/clinical-simulation-editor").then((module) => module.ClinicalSimulationEditor), { ssr: false });
type MediaItem = { id: string; title: string | null; phase: string; mediaType: string; captureSession: string | null; bodyRegion: string | null; viewCode: string | null; patientPosition: string | null; consentPurpose: string; parentMediaId: string | null; annotations: Array<Record<string, unknown>>; src: string };
type SimulationSource = { src: string; title: string; parentMediaId?: string; phase: string; annotations?: Array<Record<string, unknown>> };
const phaseLabels: Record<string, string> = { before: "Antes", during: "Durante", after: "Depois", clinical: "Clínico" };
const regionLabels: Record<string, string> = { face: "Face", neck: "Pescoço e papada", scalp: "Couro cabeludo", chest: "Tórax", abdomen: "Abdômen", back: "Costas", glutes: "Glúteos", arms: "Braços", hands: "Mãos", thighs: "Coxas", legs: "Pernas", feet: "Pés", oral: "Odontologia / intraoral", full_body: "Corpo inteiro", custom: "Região personalizada" };
const viewLabels: Record<string, string> = { front: "Frontal", back: "Posterior", three_quarter_right: "¾ direita", three_quarter_left: "¾ esquerda", profile_right: "Lateral / perfil direito", profile_left: "Lateral / perfil esquerdo", superior: "Superior", inferior: "Inferior", close_up: "Detalhe", custom: "Posição personalizada" };
const templates: SimulationSource[] = [
  { src: "/simulator/models/female-front.png", title: "Feminino — frontal", phase: "clinical" },
  { src: "/simulator/models/female-three-quarter-right.png", title: "Feminino — ¾ direita", phase: "clinical" },
  { src: "/simulator/models/female-profile-right.png", title: "Feminino — perfil direito", phase: "clinical" },
  { src: "/simulator/models/female-inferior.png", title: "Feminino — vista inferior", phase: "clinical" },
  { src: "/simulator/models/female-aging.png", title: "Feminino — envelhecimento", phase: "clinical" },
  { src: "/simulator/models/male-front.png", title: "Masculino — frontal", phase: "clinical" },
  { src: "/simulator/models/male-three-quarter-right.png", title: "Masculino — ¾ direita", phase: "clinical" },
  { src: "/simulator/models/male-profile-right.png", title: "Masculino — perfil direito", phase: "clinical" },
  { src: "/simulator/models/male-inferior.png", title: "Masculino — vista inferior", phase: "clinical" },
  { src: "/simulator/models/male-aging.png", title: "Masculino — envelhecimento", phase: "clinical" },
];

export function ClinicalMediaGallery({ clientId, media, canManage }: { clientId: string; media: MediaItem[]; canManage: boolean }) {
  const router = useRouter(); const [comparison, setComparison] = useState<string[]>([]); const [split, setSplit] = useState(50);
  const [simulating, setSimulating] = useState<SimulationSource | null>(null); const [message, setMessage] = useState(""); const [pending, startTransition] = useTransition();
  const selected = comparison.map((id) => media.find((item) => item.id === id)).filter(Boolean) as MediaItem[];
  const pairGroups = useMemo(() => {
    const groups = new Map<string, { session: string; region: string; view: string; before?: MediaItem; after?: MediaItem }>();
    for (const item of media) {
      if (item.mediaType !== "photo" || !item.captureSession || !item.bodyRegion || !item.viewCode || !["before", "after"].includes(item.phase)) continue;
      const key = `${item.captureSession}\u0000${item.bodyRegion}\u0000${item.viewCode}`; const group = groups.get(key) ?? { session: item.captureSession, region: item.bodyRegion, view: item.viewCode };
      if (item.phase === "before" && !group.before) group.before = item; if (item.phase === "after" && !group.after) group.after = item; groups.set(key, group);
    }
    return [...groups.values()];
  }, [media]);
  function toggleComparison(id: string) { setComparison((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current.slice(-1), id]); }
  function openMedia(item: MediaItem) { const base = item.parentMediaId ? media.find((candidate) => candidate.id === item.parentMediaId) : item; setSimulating({ src: base?.src ?? item.src, title: item.title || "Simulação", parentMediaId: item.parentMediaId ?? item.id, phase: item.phase, annotations: item.mediaType === "simulation" ? item.annotations : [] }); }
  function saveSimulation(blob: Blob, annotations: SimulationShape[]) {
    if (!simulating) return; startTransition(async () => { const formData = new FormData(); formData.set("clientId", clientId); if (simulating.parentMediaId) formData.set("parentMediaId", simulating.parentMediaId); formData.set("phase", simulating.phase); formData.set("mediaType", "simulation"); formData.set("annotations", JSON.stringify(annotations)); formData.set("title", `${simulating.title.replace(/ — simulação$/i, "")} — simulação`); formData.set("consentConfirmed", "on"); formData.set("file", new File([blob], "simulacao-procedimento.webp", { type: "image/webp" }));
      try { await createClientClinicalMedia(formData); setSimulating(null); setMessage("Simulação salva no prontuário como uma nova versão."); router.refresh(); } catch { setMessage("Não foi possível salvar a simulação."); }
    });
  }
  async function generateBeforeAfter() {
    if (selected.length !== 2) return;
    const before = selected.find((item) => item.phase === "before"); const after = selected.find((item) => item.phase === "after");
    if (!before || !after) { setMessage("Selecione uma fotografia Antes e uma Depois."); return; }
    if (!before.captureSession || before.captureSession !== after.captureSession || before.bodyRegion !== after.bodyRegion || before.viewCode !== after.viewCode) {
      setMessage("Para gerar a composição, as fotos devem ter a mesma sessão, região e vista."); return;
    }
    setMessage("Preparando composição…");
    try {
      const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new window.Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
      const [beforeImage, afterImage] = await Promise.all([load(before.src), load(after.src)]);
      const panelWidth = 900; const panelHeight = 900; const headerHeight = 92; const canvas = document.createElement("canvas"); canvas.width = panelWidth * 2; canvas.height = panelHeight + headerHeight;
      const context = canvas.getContext("2d"); if (!context) throw new Error(); context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
      const drawContained = (image: HTMLImageElement, offsetX: number) => { const scale = Math.min(panelWidth / image.width, panelHeight / image.height); const width = image.width * scale; const height = image.height * scale; context.drawImage(image, offsetX + (panelWidth - width) / 2, headerHeight + (panelHeight - height) / 2, width, height); };
      drawContained(beforeImage, 0); drawContained(afterImage, panelWidth); context.fillStyle = "#10231e"; context.font = "700 38px sans-serif"; context.textAlign = "center"; context.fillText("ANTES", panelWidth / 2, 58); context.fillText("DEPOIS", panelWidth + panelWidth / 2, 58); context.fillStyle = "#167255"; context.fillRect(panelWidth - 3, 0, 6, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85)); if (!blob) throw new Error();
      const formData = new FormData(); formData.set("clientId", clientId); formData.set("phase", "clinical"); formData.set("mediaType", "comparison"); formData.set("captureSession", before.captureSession); if (before.bodyRegion) formData.set("bodyRegion", before.bodyRegion); if (before.viewCode) formData.set("viewCode", before.viewCode); if (before.patientPosition) formData.set("patientPosition", before.patientPosition); formData.set("consentPurpose", before.consentPurpose === "marketing" && after.consentPurpose === "marketing" ? "marketing" : "clinical"); formData.set("sourceMediaIds", JSON.stringify([before.id, after.id])); formData.set("title", `Antes e depois — ${regionLabels[before.bodyRegion ?? ""] ?? before.bodyRegion ?? "registro clínico"} — ${viewLabels[before.viewCode ?? ""] ?? before.viewCode ?? "vista"}`); formData.set("consentConfirmed", "on"); formData.set("file", new File([blob], "antes-e-depois.webp", { type: "image/webp" }));
      startTransition(async () => { try { await createClientClinicalMedia(formData); setComparison([]); setMessage("Composição Antes e Depois salva no prontuário."); router.refresh(); } catch { setMessage("Não foi possível salvar a composição."); } });
    } catch { setMessage("Não foi possível gerar a composição com as imagens selecionadas."); }
  }
  return <div className="mt-5">
    {canManage && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"><h3 className="flex items-center gap-2 font-extrabold"><PencilRuler size={19} /> Simulador de procedimentos</h3><p className="mt-1 text-sm text-muted">Use uma fotografia clínica ou comece por um modelo facial ilustrativo.</p><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-10">{templates.map((template) => <button key={template.src} type="button" className="group min-w-0 overflow-hidden rounded-xl border bg-white text-left hover:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600" onClick={() => setSimulating(template)}><span className="relative block aspect-square overflow-hidden bg-slate-50"><Image src={template.src} alt={template.title} fill className="object-cover transition-transform group-hover:scale-[1.03]" /></span><span className="block break-words p-1.5 text-xs font-bold leading-snug">{template.title}</span></button>)}</div></div>}
    {selected.length === 2 && <div className="mb-5 rounded-2xl border bg-black p-3"><div className="relative mx-auto aspect-[4/3] max-w-3xl overflow-hidden rounded-xl"><Image src={selected[0].src} alt={selected[0].title || "Comparação anterior"} fill unoptimized className="object-contain" /><div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${split}%` }}><div className="relative h-full" style={{ width: `${10000 / split}%` }}><Image src={selected[1].src} alt={selected[1].title || "Comparação posterior"} fill unoptimized className="object-contain" /></div></div><div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${split}%` }} /></div><input className="mt-3 w-full accent-brand" type="range" min="5" max="95" value={split} onChange={(event) => setSplit(Number(event.target.value))} aria-label="Divisor da comparação" /><div className="mt-3 flex justify-end"><button type="button" className="primary-button" disabled={pending} onClick={generateBeforeAfter}>{pending ? "Salvando…" : "Gerar imagem Antes e Depois"}</button></div></div>}
    {message && <p className="mb-3 text-sm font-bold text-brand" role="status">{message}</p>}
    {pairGroups.length > 0 && <div className="mb-5 rounded-2xl border p-4"><h3 className="font-extrabold">Pares Antes e Depois</h3><p className="mt-1 text-xs text-muted">O pareamento considera sessão, região corporal e vista. Selecione um par completo para comparar e gerar a imagem única.</p><div className="mt-3 grid gap-2 md:grid-cols-2">{pairGroups.map((group) => <div key={`${group.session}-${group.region}-${group.view}`} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{group.session}</p><p className="text-xs text-muted">{regionLabels[group.region] ?? group.region} · {viewLabels[group.view] ?? group.view}</p></div>{group.before && group.after ? <button type="button" className="shrink-0 text-xs font-extrabold text-brand" onClick={() => setComparison([group.before!.id, group.after!.id])}>Comparar par</button> : <span className="shrink-0 rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-700">Falta {group.before ? "Depois" : "Antes"}</span>}</div>)}</div></div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{media.map((item) => <article key={item.id} className="rounded-2xl border p-3"><div className="relative aspect-square"><Image className="rounded-xl object-cover" src={item.src} alt={item.title || "Fotografia clínica"} fill unoptimized /></div><p className="mt-2 font-bold">{item.title || "Registro clínico"}</p>{item.captureSession && <p className="mt-1 text-xs text-muted">{item.captureSession}{item.bodyRegion ? ` · ${regionLabels[item.bodyRegion] ?? item.bodyRegion}` : ""}{item.viewCode ? ` · ${viewLabels[item.viewCode] ?? item.viewCode}` : ""}</p>}<div className="mt-2 flex flex-wrap items-center gap-2"><span className="status-pill">{item.mediaType === "simulation" ? "Simulação" : item.mediaType === "comparison" ? "Antes e depois" : phaseLabels[item.phase] ?? item.phase}</span>{item.mediaType === "photo" && <button type="button" className={`text-xs font-bold ${comparison.includes(item.id) ? "text-brand" : "text-muted"}`} onClick={() => toggleComparison(item.id)}><Images size={14} className="inline" /> {comparison.includes(item.id) ? "Selecionada" : "Comparar"}</button>}{canManage && item.mediaType !== "comparison" && <button type="button" className="text-xs font-bold text-brand" onClick={() => openMedia(item)}><PencilRuler size={14} className="inline" /> {item.mediaType === "simulation" ? "Continuar" : "Simular"}</button>}</div>{canManage && <ActionForm action={deleteClientClinicalMedia} successMessage={item.mediaType === "photo" ? "Fotografia excluída com sucesso." : "Registro excluído com sucesso."} className="mt-3 border-t pt-3" onSuccess={() => { setComparison((current) => current.filter((id) => id !== item.id)); if (simulating?.parentMediaId === item.id) setSimulating(null); }}><input type="hidden" name="mediaId" value={item.id} /><button type="submit" className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-600 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50" aria-label={`Excluir ${item.title || (item.mediaType === "photo" ? "fotografia clínica" : "registro clínico")}`}><Trash2 size={16} aria-hidden="true" />{item.mediaType === "photo" ? "Excluir foto" : "Excluir registro"}</button></ActionForm>}</article>)}</div>
    {!media.length && <p className="empty-state">Nenhuma fotografia ou simulação clínica registrada.</p>}
    {simulating && <ClinicalSimulationEditor source={simulating.src} initialAnnotations={simulating.annotations} saving={pending} onClose={() => setSimulating(null)} onSave={saveSimulation} />}
  </div>;
}
