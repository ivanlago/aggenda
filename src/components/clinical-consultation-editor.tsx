"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveClinicalDraft, finalizeClinicalDraft } from "@/actions/clinical-draft";
import { blankClinicalDraft, validateClinicalDraft, clinicalFieldErrors, type ClinicalDraftData } from "@/lib/clinical-draft";
import { ClinicalApplications } from "./clinical-applications";

const medicalLabels = { subjective: "Queixa e história atual", objective: "Exame e achados objetivos", assessment: "Avaliação profissional", plan: "Conduta e plano", procedure: "Procedimento / técnica", intercurrences: "Intercorrências e providências", instructions: "Orientações ao paciente" };
const aestheticLabels = { subjective: "Objetivo e expectativas", objective: "Avaliação da região e achados", assessment: "Avaliação profissional", plan: "Plano do atendimento e acompanhamento", procedure: "Procedimento e técnica utilizados", intercurrences: "Intercorrências e providências", instructions: "Orientações e cuidados posteriores" };
const vitals = { weight: "Peso (kg)", height: "Altura (cm)", systolic: "Pressão sistólica (mmHg)", diastolic: "Pressão diastólica (mmHg)", heartRate: "Frequência cardíaca (bpm)", temperature: "Temperatura (°C)", oxygenSaturation: "Saturação de O₂ (%)" };

export function ClinicalConsultationEditor({ appointmentId, initialId, initialVersion = 0, initialData, initialSavedAt, timezone = "America/Bahia" }: {
  appointmentId: string; initialId: string; initialVersion?: number; initialData: ClinicalDraftData; initialSavedAt?: string; timezone?: string;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [savedJson, setSavedJson] = useState(JSON.stringify(initialData));
  const [savedAt, setSavedAt] = useState(initialSavedAt);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [done, setDone] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reviewed, setReviewed] = useState(false);
  const latest = useRef(initialData), saved = useRef(JSON.stringify(initialData)), version = useRef(initialVersion), id = useRef(initialId);
  const inFlight = useRef<Promise<boolean> | null>(null), blocked = useRef(false), formRef = useRef<HTMLFormElement>(null);
  const dirty = JSON.stringify(data) !== savedJson;
  const change = (update: (current: ClinicalDraftData) => ClinicalDraftData) => {
    const next = update(latest.current); latest.current = next; setData(next); setReviewed(false); setErrors({});
  };

  const flush = useCallback(async (): Promise<boolean> => {
    while (inFlight.current) await inFlight.current;
    if (blocked.current) return false;
    const snapshot = latest.current; const json = JSON.stringify(snapshot);
    if (json === saved.current && version.current > 0) return true;
    setSaving(true);
    const task = (async () => {
      try {
        const result = await saveClinicalDraft({ appointmentId, id: id.current, version: version.current, data: snapshot });
        if (!result.ok) {
          if (result.conflict) { blocked.current = true; setConflict(true); }
          setMessage(result.error); return false;
        }
        version.current = result.version; saved.current = json; setSavedJson(json); setSavedAt(result.savedAt); setMessage(""); return true;
      } catch { setMessage("Falha de conexão. Seu texto permanece nesta tela. Tente salvar novamente antes de sair."); return false; }
    })();
    inFlight.current = task;
    try { return await task; } finally { inFlight.current = null; setSaving(false); }
  }, [appointmentId]);

  useEffect(() => {
    if (!dirty || done || conflict || finalizing) return;
    const timer = window.setTimeout(() => { void flush(); }, 1500);
    return () => window.clearTimeout(timer);
  }, [data, dirty, done, conflict, finalizing, flush]);

  useEffect(() => {
    const unsaved = () => !done && JSON.stringify(latest.current) !== saved.current;
    const unload = (event: BeforeUnloadEvent) => { if (unsaved()) { event.preventDefault(); event.returnValue = ""; } };
    const leave = (event: MouseEvent) => {
      if (!unsaved() || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href);
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (!window.confirm("Há alterações clínicas ainda não salvas no servidor. Deseja sair mesmo assim?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", leave, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", leave, true); };
  }, [done]);

  async function finish(event: FormEvent) {
    event.preventDefault(); setErrors({}); setMessage("");
    const parsed = validateClinicalDraft(latest.current);
    if (!parsed.success) {
      const fieldErrors = clinicalFieldErrors(parsed.error.issues);
      for (const name of ["subjective", "assessment", "plan"] as const) if (!latest.current[name].trim()) fieldErrors[name] = "Preencha este campo para finalizar.";
      setErrors(fieldErrors); setMessage("Revise os campos indicados. Seu rascunho não foi finalizado.");
      window.setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0); return;
    }
    if (!reviewed) { setMessage("Confirme a revisão do conteúdo antes de finalizar."); return; }
    setFinalizing(true);
    try {
      if (!await flush()) return;
      const result = await finalizeClinicalDraft({ appointmentId, id: id.current, version: version.current, reviewConfirmed: true });
      if (!result.ok) { setMessage(result.error); setErrors(result.fieldErrors ?? {}); if (result.conflict) { blocked.current = true; setConflict(true); } return; }
      setDone(true); router.refresh();
    } catch { setMessage("Não foi possível confirmar a finalização. O rascunho salvo permanece no servidor; tente novamente sem criar outro registro."); }
    finally { setFinalizing(false); }
  }

  if (done) return <section className="panel" role="status"><h2 className="text-xl font-extrabold">Registro clínico finalizado</h2><p className="mt-2 text-sm">O conteúdo foi preservado no prontuário. O agendamento e o pagamento mantêm suas situações próprias.</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" className="primary-button" onClick={() => window.dispatchEvent(new CustomEvent("aggenda:attendance-tab", { detail: "overview" }))}>Conferir encerramento do atendimento</button><button type="button" className="secondary-button" onClick={() => {
    const next = blankClinicalDraft(data.mode); id.current = crypto.randomUUID(); version.current = 0; latest.current = next; saved.current = JSON.stringify(next); blocked.current = false;
    setData(next); setSavedJson(saved.current); setSavedAt(undefined); setReviewed(false); setMessage(""); setErrors({}); setConflict(false); setDone(false);
  }}>Criar registro complementar</button></div></section>;

  const labels = data.mode === "medical" ? medicalLabels : aestheticLabels;
  const prefix = `clinical-${initialId}`;
  const textarea = (name: keyof typeof labels) => <label className="grid gap-1 text-sm font-bold" key={name}>{labels[name]}{["subjective", "assessment", "plan"].includes(name) ? " *" : ""}<textarea id={`${prefix}-${name}`} className="field min-h-28" maxLength={10000} value={data[name]} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `${prefix}-${name}-error` : undefined} onChange={event => change(current => ({ ...current, [name]: event.target.value }))} />{errors[name] && <span className="text-sm font-normal text-red-700" id={`${prefix}-${name}-error`}>{errors[name]}</span>}</label>;
  return <section className="panel"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-extrabold">Evolução da consulta</h2><p className="mt-1 text-sm text-muted">Preencha e salve como rascunho. Ao finalizar, o registro será preservado e poderá receber adendos.</p></div><p className={`text-sm font-bold ${dirty || message ? "text-amber-800" : "text-brand"}`} role="status" aria-live="polite">{saving ? "Salvando rascunho…" : dirty ? "Alterações ainda não salvas" : savedAt ? `Salvo no servidor às ${new Date(savedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: timezone })}` : "Nenhum rascunho salvo"}</p></div>
    {initialVersion > 0 && <p className="mt-3 text-xs text-muted">Rascunho recuperado do servidor. Ele pertence a você e a este atendimento.</p>}
    {message && <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm" role="alert"><p>{message}</p>{Object.values(errors).map((error, index) => <p key={index}>{error}</p>)}</div>}
    <form ref={formRef} onSubmit={finish} className="mt-4" noValidate><fieldset disabled={finalizing} className="grid gap-4">
      <label className="grid gap-1 text-sm font-bold">Perfil do registro<select className="field" value={data.mode} onChange={event => change(current => ({ ...current, mode: event.target.value as ClinicalDraftData["mode"] }))}><option value="medical">Consulta médica particular</option><option value="aesthetic">Atendimento de estética</option></select></label>
      <div className="grid gap-4 lg:grid-cols-2">{textarea("subjective")}{textarea("objective")}{textarea("assessment")}{textarea("plan")}</div>
      <details open={data.mode === "aesthetic"}><summary className="cursor-pointer font-bold">Procedimento, produtos e intercorrências</summary><div className="mt-4 grid gap-4 md:grid-cols-2">{textarea("procedure")}{textarea("intercurrences")}<ClinicalApplications value={data.applications} onChange={applications => change(current => ({ ...current, applications }))} /></div></details>
      <details open={data.mode === "medical"}><summary className="cursor-pointer font-bold">Medidas e sinais vitais — opcionais</summary><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(vitals).map(([key, label]) => <label className="grid gap-1 text-sm" key={key}>{label}<input className="field" inputMode="decimal" value={data.vitals[key as keyof typeof vitals]} aria-invalid={Boolean(errors[`vitals.${key}`])} aria-describedby={errors[`vitals.${key}`] ? `${prefix}-${key}-error` : undefined} onChange={event => change(current => ({ ...current, vitals: { ...current.vitals, [key]: event.target.value } }))} />{errors[`vitals.${key}`] && <span className="text-red-700" id={`${prefix}-${key}-error`}>{errors[`vitals.${key}`]}</span>}</label>)}</div></details>
      {textarea("instructions")}<label className="grid max-w-sm gap-1 text-sm font-bold">Data de retorno sugerida<input className="field" type="date" value={data.followUpDate} onChange={event => change(current => ({ ...current, followUpDate: event.target.value }))} /><span className="text-xs font-normal text-muted">Não cria agendamento ou lembrete automaticamente.</span></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />Revisei o conteúdo, as medidas e os produtos e confirmo a finalização deste registro.</label>
      <div className="flex flex-wrap gap-3"><button className="secondary-button" type="button" disabled={saving || conflict} onClick={() => { void flush(); }}>Salvar rascunho agora</button><button className="primary-button" type="submit" disabled={conflict}>{finalizing ? "Finalizando…" : "Finalizar registro clínico"}</button></div>
    </fieldset></form>
  </section>;
}
