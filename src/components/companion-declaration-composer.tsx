"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { DocumentDeliveryControls } from "@/components/document-delivery-controls";

type Option = { id: string; name: string; email?: string | null; phone?: string | null };

export function CompanionDeclarationComposer({ templateId, clients, professionals, organizationName, initialDate }: {
  templateId: string;
  clients: Option[];
  professionals: Option[];
  organizationName: string;
  initialDate: string;
}) {
  const [professionalId, setProfessionalId] = useState("");
  const [clientId, setClientId] = useState("");
  const [companionName, setCompanionName] = useState("");
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState("");
  const client = clients.find(item => item.id === clientId);
  const professional = professionals.find(item => item.id === professionalId);
  const formattedDate = date.split("-").reverse().join("/");
  const content = `Declaro, para os devidos fins, que ${companionName.trim()} acompanhou o(a) paciente ${client?.name ?? ""} em atendimento na ${organizationName}, no dia ${formattedDate}, das ${startTime} às ${endTime}.\n\nEsta declaração registra a presença do acompanhante durante o período informado.\n\nData de emissão: {{data}}.\nProfissional responsável: {{profissional}}.`;

  function openPreview() {
    if (!professionalId || !clientId || companionName.trim().length < 2 || !date || !startTime || !endTime) {
      setError("Selecione o profissional e o paciente e preencha o nome do acompanhante, a data e o período.");
      return;
    }
    if (endTime <= startTime) {
      setError("O horário final deve ser posterior ao horário inicial.");
      return;
    }
    setError("");
    setPreviewOpen(true);
  }

  return <>
    <input type="hidden" name="templateId" value={templateId} />
    <input type="hidden" name="title" value="DECLARAÇÃO ACOMPANHANTE" />
    <input type="hidden" name="content" value={content} />
    <div className="grid gap-3 md:grid-cols-3">
      <label className="grid min-w-0 gap-1 text-sm font-bold">Profissional emissor<select className="field" name="professionalId" required value={professionalId} onChange={event => setProfessionalId(event.target.value)}><option value="" disabled>Selecione o profissional</option>{professionals.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid min-w-0 gap-1 text-sm font-bold">Paciente<select className="field" name="clientId" required value={clientId} onChange={event => setClientId(event.target.value)}><option value="" disabled>Selecione o paciente</option>{clients.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="grid min-w-0 gap-1 text-sm font-bold">Nome do acompanhante<input className="field" required minLength={2} maxLength={180} value={companionName} onChange={event => setCompanionName(event.target.value)} placeholder="Nome completo" /></label>
    </div>
    <div className="grid gap-3 md:grid-cols-3">
      <label className="grid min-w-0 gap-1 text-sm font-bold">Data do acompanhamento<input className="field" type="date" required value={date} onChange={event => setDate(event.target.value)} /></label>
      <label className="grid min-w-0 gap-1 text-sm font-bold">Horário inicial<input className="field" type="time" required value={startTime} onChange={event => setStartTime(event.target.value)} /></label>
      <label className="grid min-w-0 gap-1 text-sm font-bold">Horário final<input className="field" type="time" required value={endTime} onChange={event => setEndTime(event.target.value)} /></label>
    </div>
    {error && <p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800" role="alert">{error}</p>}
    <button type="button" className="primary-button w-fit" onClick={openPreview}>Visualizar declaração</button>
    {previewOpen && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="companion-preview-title"><div className="my-6 w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl sm:p-8">
      <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Pré-visualização</p><h2 className="text-2xl font-extrabold" id="companion-preview-title">Revise antes de emitir</h2></div><button type="button" className="rounded-xl p-2 hover:bg-slate-100" onClick={() => setPreviewOpen(false)} aria-label="Fechar pré-visualização"><X className="size-5" /></button></div>
      <div className="my-6 rounded-xl border bg-white p-6 shadow-sm sm:p-10"><h3 className="mb-8 text-center text-xl font-extrabold">DECLARAÇÃO ACOMPANHANTE</h3><div className="whitespace-pre-wrap leading-7">{content.replaceAll("{{data}}", initialDate.split("-").reverse().join("/")).replaceAll("{{profissional}}", professional?.name ?? "")}</div><div className="mt-16 border-t pt-3 text-center"><p className="font-bold">{professional?.name}</p><p className="text-sm text-muted">Carimbo e assinatura</p></div></div>
      <DocumentDeliveryControls key={clientId} email={client?.email} phone={client?.phone} />
    </div></div>}
  </>;
}
