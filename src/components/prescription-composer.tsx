"use client";

import { Trash2, X } from "lucide-react";
import { DocumentDeliveryControls } from "@/components/document-delivery-controls";
import { useId, useMemo, useState } from "react";

import { TussAutocomplete, type TussItem } from "@/components/tuss-autocomplete";

type Option = { id: string; name: string; email?: string | null; phone?: string | null };
type Medication = { id: number; name: string; presentation: string; route: string; dosage: string; quantity: string; notes: string; tussCode: string };
type InitialPrescription = { clientId?: string; professionalId?: string; kind?: string; observations?: string; includeDate?: boolean; medications?: Omit<Medication, "id">[] };

const emptyMedication = (id: number): Medication => ({ id, name: "", presentation: "", route: "", dosage: "", quantity: "", notes: "", tussCode: "" });

export function PrescriptionComposer({ templateId, organizationName, clients, professionals, initial, fixedParticipants = false }: { templateId: string; organizationName: string; clients: Option[]; professionals: Option[]; fixedParticipants?: boolean; initial?: InitialPrescription | null }) {
  const [kind, setKind] = useState(initial?.kind ?? "Receituário simples");
  const [medications, setMedications] = useState<Medication[]>(initial?.medications?.length ? initial.medications.map((item, index) => ({ ...item, dosage: [item.dosage, item.notes].filter(Boolean).join("\n"), notes: "", id: index + 1 })) : []);
  const [observations, setObservations] = useState(initial?.observations ?? "");
  const [includeDate, setIncludeDate] = useState(initial?.includeDate ?? true);
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [professionalId, setProfessionalId] = useState(initial?.professionalId ?? "");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [medicationError, setMedicationError] = useState("");
  const [draftMedication, setDraftMedication] = useState<Medication>(emptyMedication(0));
  const medicationFormId = useId();
  const [medicationFormOpen, setMedicationFormOpen] = useState(false);
  const [medicationSearchKey, setMedicationSearchKey] = useState(0);
  const selectedClient = clients.find((item) => item.id === clientId);
  const selectedProfessional = professionals.find((item) => item.id === professionalId);
  const content = useMemo(() => `Paciente: {{cliente}}\n\n${medications.map((item, index) => [
    `${index + 1}. ${item.name}${item.presentation ? ` · ${item.presentation}` : ""}`,
    item.route ? `Via de uso: ${item.route}` : "",
    `Posologia e orientações: ${item.dosage}`,
    item.quantity ? `Quantidade: ${item.quantity}` : "",
    item.notes ? `Orientações: ${item.notes}` : "",
  ].filter(Boolean).join("\n")).join("\n\n")}${observations.trim() ? `\n\nObservações gerais:\n${observations.trim()}` : ""}${includeDate ? "\n\nData: {{data}}." : ""}`, [includeDate, medications, observations]);

  function selectMedication(item: TussItem) {
    setDraftMedication({ ...emptyMedication(0), name: item.name, presentation: item.presentation ?? "", tussCode: item.code });
    setMedicationError("");
  }

  function selectCustomMedication(name: string) {
    setDraftMedication({ ...emptyMedication(0), name });
    setMedicationError("");
  }

  function insertMedication() {
    if (!draftMedication.name.trim()) { setMedicationError("Busque ou informe o medicamento."); return; }
    if (!draftMedication.dosage.trim()) { setMedicationError("Preencha a posologia e as orientações antes de inserir o medicamento."); return; }
    setMedications((current) => [...current, { ...draftMedication, id: Math.max(0, ...current.map((medication) => medication.id)) + 1 }]);
    setDraftMedication(emptyMedication(0));
    setMedicationSearchKey((current) => current + 1);
    setMedicationFormOpen(false);
    setMedicationError("");
  }

  return <>
    <input type="hidden" name="templateId" value={templateId} />
    <input type="hidden" name="title" value={kind} />
    <input type="hidden" name="content" value={content} />
    <input type="hidden" name="prescriptionData" value={JSON.stringify({ kind, medications: medications.map((item) => ({ name: item.name, presentation: item.presentation, route: item.route, dosage: item.dosage, quantity: item.quantity, notes: item.notes, tussCode: item.tussCode })), observations, includeDate })} />
    <div className="grid gap-3 md:grid-cols-3">
      {fixedParticipants ? <><label className="grid min-w-0 gap-1 text-sm font-bold">Paciente<input type="hidden" name="clientId" value={clientId} /><span className="field font-normal">{selectedClient?.name}</span></label><label className="grid min-w-0 gap-1 text-sm font-bold">Médico emissor<input type="hidden" name="professionalId" value={professionalId} /><span className="field font-normal">{selectedProfessional?.name}</span></label></> : <><label className="grid gap-1 text-sm font-bold">Paciente<select className="field" name="clientId" required value={clientId} onChange={(event) => setClientId(event.target.value)}><option value="" disabled>Selecione o paciente</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm font-bold">Médico emissor<select className="field" name="professionalId" required value={professionalId} onChange={(event) => setProfessionalId(event.target.value)}><option value="" disabled>Selecione o profissional</option>{professionals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></>}
      <label className="grid gap-1 text-sm font-bold">Tipo de receituário<select className="field" value={kind} onChange={(event) => setKind(event.target.value)}><option>Receituário simples</option><option>Receituário antimicrobiano</option><option>Receituário de controle especial</option></select></label>
    </div>

    <div className="grid gap-3">
      <div className="divide-y rounded-2xl border">{medications.map((medication, index) => <div className="grid gap-2 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start" key={medication.id}>
        <span className="pt-1 text-sm font-extrabold text-muted">{index + 1}.</span>
        <div className="min-w-0"><p className="truncate font-extrabold">{medication.name}{medication.presentation ? ` · ${medication.presentation}` : ""}</p><p className="truncate text-xs font-bold text-emerald-700">{medication.dosage}</p></div>
        <button type="button" className="rounded-lg p-2 text-red-700 hover:bg-red-50" onClick={() => setMedications((current) => current.filter((item) => item.id !== medication.id))} aria-label={`Remover medicamento ${index + 1}`}><Trash2 className="size-4" /></button>
      </div>)}{!medications.length ? <p className="p-4 text-sm text-muted">Nenhum medicamento adicionado.</p> : null}</div>
      <button type="button" className="primary-button w-fit" aria-expanded={medicationFormOpen} aria-controls={medicationFormId} onClick={() => setMedicationFormOpen((open) => !open)}>{medicationFormOpen ? "Minimizar formulário" : "+ Adicionar medicamento"}</button>
      <div id={medicationFormId} hidden={!medicationFormOpen}>
      <div className="grid gap-3 rounded-2xl border bg-slate-50 p-4">
        <TussAutocomplete key={medicationSearchKey} table="20" label="Buscar medicamento" nameField="medication-search" onSelect={selectMedication} onCustom={selectCustomMedication} />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-bold">Medicamento<input className="field" value={draftMedication.name} onChange={(event) => setDraftMedication((current) => ({ ...current, name: event.target.value }))} placeholder="Nome do medicamento" /></label>
          <label className="grid gap-1 text-sm font-bold">Apresentação<input className="field" value={draftMedication.presentation} onChange={(event) => setDraftMedication((current) => ({ ...current, presentation: event.target.value }))} placeholder="Ex.: 500 mg, caixa com 20" /></label>
          <label className="grid gap-1 text-sm font-bold md:col-span-2">Posologia e orientações<textarea className="field min-h-20" value={draftMedication.dosage} onChange={(event) => setDraftMedication((current) => ({ ...current, dosage: event.target.value }))} placeholder="Ex.: tomar 1 comprimido a cada 8 horas por 7 dias" /></label>
        </div>
        <button type="button" className="primary-button w-fit" onClick={insertMedication}>Inserir medicamento</button>
      </div>
      </div>
      {medicationError ? <p className="text-sm font-bold text-red-700">{medicationError}</p> : null}
    </div>
    <details className="rounded-xl border p-3">
      <summary className="cursor-pointer text-sm font-bold">Observações gerais (opcional)</summary>
      <label className="mt-3 grid gap-1"><span className="sr-only">Observações gerais (opcional)</span><textarea className="field min-h-24" value={observations} onChange={(event) => setObservations(event.target.value)} placeholder="Opcional" /></label>
    </details>
    <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={includeDate} onChange={(event) => setIncludeDate(event.target.checked)} />Exibir data no documento</label>
    <button type="button" className="primary-button w-fit" onClick={(event) => { if (!medications.length) { setMedicationError("Adicione ao menos um medicamento."); return; } if (medications.some((item) => !item.name.trim() || !item.dosage.trim())) { setMedicationError("Preencha a posologia e as orientações de todos os medicamentos antes de visualizar."); return; } setMedicationError(""); const form = event.currentTarget.closest("form"); if (form?.reportValidity()) setPreviewOpen(true); }}>Visualizar receita</button>

    {previewOpen ? <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="prescription-preview-title">
      <div className="my-6 w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Pré-visualização</p><h2 className="text-2xl font-extrabold" id="prescription-preview-title">Revise antes de emitir</h2></div><button type="button" className="rounded-xl p-2 hover:bg-slate-100" onClick={() => setPreviewOpen(false)} aria-label="Fechar pré-visualização"><X className="size-5" /></button></div>
        <div className="my-6 rounded-xl border bg-white p-6 shadow-sm sm:p-10">
          <div className="border-b-2 border-brand pb-4"><p className="text-xl font-extrabold text-brand">{organizationName}</p><p className="mt-1 text-xs text-muted">O PDF final incluirá o papel timbrado e os dados institucionais cadastrados.</p></div>
          <h3 className="my-6 text-2xl font-extrabold">{kind}</h3>
          <p className="mb-5"><strong>Paciente:</strong> {selectedClient?.name}</p>
          <div className="space-y-5">{medications.map((item, index) => <div key={item.id}><p className="font-extrabold">{index + 1}. {item.name}{item.presentation ? ` · ${item.presentation}` : ""}</p>{item.route ? <p>Via de uso: {item.route}</p> : null}<p className="whitespace-pre-wrap">Posologia e orientações: {item.dosage}</p>{item.quantity ? <p>Quantidade: {item.quantity}</p> : null}{item.notes ? <p>Orientações: {item.notes}</p> : null}</div>)}</div>
          {observations ? <div className="mt-6"><strong>Observações gerais:</strong><p className="whitespace-pre-wrap">{observations}</p></div> : null}
          <div className="mt-8 border-t pt-4"><p className="font-bold">{selectedProfessional?.name}</p>{includeDate ? <p className="text-sm text-muted">Data de emissão: {new Date().toLocaleDateString("pt-BR")}</p> : null}</div>
        </div>
        <DocumentDeliveryControls key={clientId} email={selectedClient?.email} phone={selectedClient?.phone} />
      </div>
    </div> : null}
  </>;
}
