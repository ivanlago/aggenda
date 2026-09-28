"use client";

import { Trash2, X } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { DocumentDeliveryControls } from "@/components/document-delivery-controls";
import { ProcedureAutocomplete, type RegisteredProcedure } from "@/components/procedure-autocomplete";

type Option = { id: string; name: string; email?: string | null; phone?: string | null };
type Exam = { id: number; name: string; fullName: string; indication: string; tussCode: string; preparation: string };
type InitialExamRequest = { clientId?: string; professionalId?: string; observations?: string; includeDate?: boolean; exams?: Omit<Exam, "id">[] };
const emptyExam = (id: number): Exam => ({ id, name: "", fullName: "", indication: "", tussCode: "", preparation: "" });

export function ExamRequestComposer({ templateId, organizationName, clients, professionals, procedures, initial, fixedParticipants = false }: { templateId: string; organizationName: string; clients: Option[]; professionals: Option[]; procedures: RegisteredProcedure[]; fixedParticipants?: boolean; initial?: InitialExamRequest | null }) {
  const [exams, setExams] = useState<Exam[]>(initial?.exams?.length ? initial.exams.map((item, index) => ({ ...emptyExam(index + 1), ...item, id: index + 1 })) : []);
  const [observations, setObservations] = useState(initial?.observations ?? "");
  const [includeDate, setIncludeDate] = useState(initial?.includeDate ?? true);
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [professionalId, setProfessionalId] = useState(initial?.professionalId ?? "");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [examError, setExamError] = useState("");
  const [draftExam, setDraftExam] = useState<Exam>(emptyExam(0));
  const examFormId = useId();
  const [examFormOpen, setExamFormOpen] = useState(false);
  const [searchKey, setSearchKey] = useState(0);
  const client = clients.find((item) => item.id === clientId);
  const professional = professionals.find((item) => item.id === professionalId);
  const content = useMemo(() => `Paciente: {{cliente}}\n\nExame(s) solicitado(s):\n${exams.map((item, index) => `${index + 1}. ${item.tussCode ? `${item.tussCode} - ` : ""}${item.name}${item.indication ? `\nIndicação clínica: ${item.indication}` : ""}`).join("\n")}${observations.trim() ? `\n\nObservações gerais:\n${observations.trim()}` : ""}${includeDate ? "\n\nData: {{data}}." : ""}`, [exams, includeDate, observations]);

  function selectProcedure(item: RegisteredProcedure) { setDraftExam({ id: 0, name: item.shortName || item.name, fullName: item.name, tussCode: item.tussCode ?? "", preparation: item.preparation ?? "", indication: "" }); setExamError(""); }
  function selectCustom(name: string) { setDraftExam({ ...emptyExam(0), name, fullName: name }); setExamError(""); }
  function insertExam() {
    if (!draftExam.name.trim()) { setExamError("Busque ou informe o nome do exame antes de inserir."); return; }
    setExams((current) => [...current, { ...draftExam, id: Math.max(0, ...current.map((exam) => exam.id)) + 1 }]);
    setDraftExam(emptyExam(0)); setSearchKey((current) => current + 1); setExamFormOpen(false); setExamError("");
  }

  return <>
    <input type="hidden" name="templateId" value={templateId} /><input type="hidden" name="title" value="Solicitação de exames" /><input type="hidden" name="content" value={content} />
    <input type="hidden" name="structuredDocumentData" value={JSON.stringify({ observations, includeDate, exams: exams.map((item) => ({ name: item.name, fullName: item.fullName, indication: item.indication, tussCode: item.tussCode, preparation: item.preparation })) })} />
    <div className="grid gap-3 md:grid-cols-2">{fixedParticipants ? <><label className="grid min-w-0 gap-1 text-sm font-bold">Paciente<input type="hidden" name="clientId" value={clientId} /><span className="field font-normal">{client?.name}</span></label><label className="grid min-w-0 gap-1 text-sm font-bold">Médico emissor<input type="hidden" name="professionalId" value={professionalId} /><span className="field font-normal">{professional?.name}</span></label></> : <><label className="grid gap-1 text-sm font-bold">Paciente<select className="field" name="clientId" required value={clientId} onChange={(event) => setClientId(event.target.value)}><option value="" disabled>Selecione o paciente</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="grid gap-1 text-sm font-bold">Médico emissor<select className="field" name="professionalId" required value={professionalId} onChange={(event) => setProfessionalId(event.target.value)}><option value="" disabled>Selecione o profissional</option>{professionals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></>}</div>
    <div className="grid gap-3">
      <div className="divide-y rounded-2xl border">{exams.map((exam, index) => <div className="grid gap-2 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center" key={exam.id}><span className="text-sm font-extrabold text-muted">{index + 1}.</span><div className="min-w-0"><p className="truncate font-extrabold">{exam.tussCode ? `${exam.tussCode} - ` : ""}{exam.name}</p>{exam.indication ? <p className="truncate text-xs text-muted">Indicação: {exam.indication}</p> : null}</div><button type="button" className="rounded-lg p-2 text-red-700 hover:bg-red-50" onClick={() => setExams((current) => current.filter((item) => item.id !== exam.id))} aria-label={`Remover exame ${index + 1}`}><Trash2 className="size-4" /></button></div>)}{!exams.length ? <p className="p-4 text-sm text-muted">Nenhum exame adicionado.</p> : null}</div>
      <button type="button" className="secondary-button w-fit" aria-expanded={examFormOpen} aria-controls={examFormId} onClick={() => setExamFormOpen((open) => !open)}>{examFormOpen ? "Minimizar formulário" : "+ Adicionar exame"}</button>
      <div id={examFormId} hidden={!examFormOpen}><div className="grid gap-3 rounded-2xl border bg-slate-50/60 p-4"><ProcedureAutocomplete key={searchKey} procedures={procedures} onSelect={selectProcedure} onCustom={selectCustom} label="Buscar exame/procedimento" /><label className="grid gap-1 text-sm font-bold">Exame/Procedimento<input className="field" value={draftExam.name} onChange={(event) => setDraftExam((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: RM de crânio" /></label><label className="grid gap-1 text-sm font-bold">Indicação clínica (opcional)<input className="field" value={draftExam.indication} onChange={(event) => setDraftExam((current) => ({ ...current, indication: event.target.value }))} placeholder="Motivo clínico pertinente" /></label><button type="button" className="primary-button w-fit" onClick={insertExam}>Inserir exame</button></div></div>
      {examError ? <p className="text-sm font-bold text-red-700">{examError}</p> : null}
    </div>
    <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-bold">Observações gerais (opcional)</summary><label className="mt-3 grid gap-1"><span className="sr-only">Observações gerais (opcional)</span><textarea className="field min-h-24" value={observations} onChange={(event) => setObservations(event.target.value)} placeholder="Opcional" /></label></details>
    <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={includeDate} onChange={(event) => setIncludeDate(event.target.checked)} />Exibir data no documento</label>
    <button type="button" className="primary-button w-fit" onClick={(event) => { if (!exams.length) { setExamError("Adicione ao menos um exame."); return; } const form = event.currentTarget.closest("form"); if (form?.reportValidity()) setPreviewOpen(true); }}>Visualizar solicitação</button>
    {previewOpen ? <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="exam-preview-title"><div className="my-6 w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Pré-visualização</p><h2 className="text-2xl font-extrabold" id="exam-preview-title">Revise antes de emitir</h2></div><button type="button" className="rounded-xl p-2 hover:bg-slate-100" onClick={() => setPreviewOpen(false)} aria-label="Fechar pré-visualização"><X className="size-5" /></button></div><div className="my-6 rounded-xl border bg-white p-6 shadow-sm sm:p-10"><div className="border-b-2 border-brand pb-4"><p className="text-xl font-extrabold text-brand">{organizationName}</p><p className="mt-1 text-xs text-muted">O PDF final incluirá todos os dados do papel timbrado.</p></div><h3 className="my-6 text-2xl font-extrabold">Solicitação de exames</h3><p className="mb-5"><strong>Paciente:</strong> {client?.name}</p><div className="space-y-2">{exams.map((item, index) => <div key={item.id}><p className="font-extrabold">{index + 1}. {item.tussCode ? `${item.tussCode} - ` : ""}{item.name}</p>{item.indication ? <p>Indicação clínica: {item.indication}</p> : null}</div>)}</div>{observations ? <div className="mt-6"><strong>Observações gerais:</strong><p className="whitespace-pre-wrap">{observations}</p></div> : null}<div className="mt-8 border-t pt-4"><p className="font-bold">{professional?.name}</p>{includeDate ? <p className="text-sm text-muted">Data de emissão: {new Date().toLocaleDateString("pt-BR")}</p> : null}</div></div><DocumentDeliveryControls key={clientId} email={client?.email} phone={client?.phone} /></div></div> : null}
  </>;
}
