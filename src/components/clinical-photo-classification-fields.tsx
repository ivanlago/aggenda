"use client";

import { useEffect, useRef, useState } from "react";

const views = {
  front: "Frontal", back: "Posterior", three_quarter_right: "¾ direita", three_quarter_left: "¾ esquerda",
  profile_right: "Lateral / perfil direito", profile_left: "Lateral / perfil esquerdo", superior: "Superior",
  inferior: "Inferior", close_up: "Detalhe aproximado", custom: "Posição personalizada",
} as const;
type ViewCode = keyof typeof views;
const regions: Array<{ value: string; label: string; views: ViewCode[] }> = [
  { value: "face", label: "Face", views: ["front", "three_quarter_right", "three_quarter_left", "profile_right", "profile_left", "superior", "inferior", "close_up"] },
  { value: "neck", label: "Pescoço e papada", views: ["front", "three_quarter_right", "three_quarter_left", "profile_right", "profile_left", "inferior"] },
  { value: "scalp", label: "Couro cabeludo", views: ["front", "profile_right", "profile_left", "superior", "back", "close_up"] },
  { value: "chest", label: "Tórax", views: ["front", "three_quarter_right", "three_quarter_left", "profile_right", "profile_left", "close_up"] },
  { value: "abdomen", label: "Abdômen", views: ["front", "three_quarter_right", "three_quarter_left", "profile_right", "profile_left", "close_up"] },
  { value: "back", label: "Costas", views: ["back", "three_quarter_right", "three_quarter_left", "close_up"] },
  { value: "glutes", label: "Glúteos", views: ["back", "three_quarter_right", "three_quarter_left", "profile_right", "profile_left"] },
  { value: "arms", label: "Braços", views: ["front", "back", "profile_right", "profile_left", "close_up"] },
  { value: "hands", label: "Mãos", views: ["front", "back", "close_up"] },
  { value: "thighs", label: "Coxas", views: ["front", "back", "profile_right", "profile_left", "close_up"] },
  { value: "legs", label: "Pernas", views: ["front", "back", "profile_right", "profile_left", "close_up"] },
  { value: "feet", label: "Pés", views: ["front", "back", "superior", "inferior", "close_up"] },
  { value: "oral", label: "Odontologia / intraoral", views: ["front", "profile_right", "profile_left", "superior", "inferior", "close_up"] },
  { value: "full_body", label: "Corpo inteiro", views: ["front", "back", "three_quarter_right", "three_quarter_left", "profile_right", "profile_left"] },
  { value: "custom", label: "Região personalizada", views: ["front", "back", "profile_right", "profile_left", "superior", "inferior", "close_up", "custom"] },
];

export function ClinicalPhotoClassificationFields() {
  const [region, setRegion] = useState(""); const [view, setView] = useState(""); const selectedRegion = regions.find((item) => item.value === region);
  const viewRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    const form = viewRef.current?.form;
    const advance = () => {
      const available = selectedRegion?.views ?? [];
      const next = available[available.indexOf(view as ViewCode) + 1];
      if (next && next !== "custom") setView(next);
    };
    form?.addEventListener("aggenda:form-saved", advance);
    return () => form?.removeEventListener("aggenda:form-saved", advance);
  }, [selectedRegion, view]);
  return <>
    <label className="grid min-w-0 gap-1.5 text-sm font-bold">Região corporal<select className="field h-12 font-normal" name="bodyRegion" value={region} onChange={(event) => { setRegion(event.target.value); setView(regions.find(item => item.value === event.target.value)?.views[0] ?? ""); }} required><option value="">Região corporal</option>{regions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    <label className="grid min-w-0 gap-1.5 text-sm font-bold">Vista / enquadramento<select ref={viewRef} className="field h-12 font-normal" aria-label="Vista / enquadramento" name="viewCode" value={view} onChange={(event) => setView(event.target.value)} disabled={!region} required><option value="">{region ? "Vista / enquadramento" : "Escolha primeiro a região"}</option>{selectedRegion?.views.map((code) => <option key={code} value={code}>{views[code]}</option>)}</select></label>
    <label className="grid min-w-0 gap-1.5 text-sm font-bold">Posição do paciente<select className="field h-12 font-normal" name="patientPosition" defaultValue="standing"><option value="standing">Em pé</option><option value="seated">Sentado</option><option value="lying">Deitado</option><option value="custom">Posição personalizada</option></select></label>
    {region === "custom" && <label className="grid gap-1.5 text-sm font-bold">Nome da região<input className="field h-12 font-normal" name="customBodyRegion" placeholder="Informe a região corporal" required /></label>}
    {view === "custom" && <label className="grid gap-1.5 text-sm font-bold">Nome da vista<input className="field h-12 font-normal" name="customViewCode" placeholder="Informe a vista / enquadramento" required /></label>}
  </>;
}
