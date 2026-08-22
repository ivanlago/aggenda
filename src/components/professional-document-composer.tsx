"use client";

import { Download, Mail, MessageCircle, ShieldCheck, X } from "lucide-react";
import { useState } from "react";

import { CidAutocomplete, type CidItem } from "@/components/cid-autocomplete";
import { TussAutocomplete, type TussItem } from "@/components/tuss-autocomplete";

type Template = { id: string; name: string; title: string; content: string; documentType: string };
type Option = { id: string; name: string; email?: string | null; phone?: string | null };

export function ProfessionalDocumentComposer({ templates, organizationName, clients, professionals, typeLabels }: {
  templates: Template[];
  organizationName: string;
  clients: Option[];
  professionals: Option[];
  typeLabels: Record<string, string>;
}) {
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [clientId, setClientId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const client = clients.find((item) => item.id === clientId);
  const professional = professionals.find((item) => item.id === professionalId);
  const selectedTemplate = templates.find((item) => item.id === templateId);
  const previewContent = content.replaceAll("{{cliente}}", client?.name ?? "").replaceAll("{{clinica}}", organizationName).replaceAll("{{profissional}}", professional?.name ?? "").replaceAll("{{data}}", new Date().toLocaleDateString("pt-BR"));

  function chooseTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((item) => item.id === id);
    setTitle(template?.title ?? "");
    setContent(template?.content ?? "");
  }

  function addMedication(item: TussItem) {
    setContent((current) => `${current}${current.trim() ? "\n" : ""}${item.name}${item.presentation ? ` · ${item.presentation}` : ""} [TUSS ${item.code}] - `);
  }

  function addCid(item: CidItem) {
    const cidLine = `CID-10: ${item.code} — ${item.description}`;
    setContent((current) => `${current}${current.trim() ? "\n\n" : ""}${cidLine}`);
  }

  return <>
    <select className="field" name="templateId" required value={templateId} onChange={(event) => chooseTemplate(event.target.value)}>
      <option value="" disabled>Modelo profissional</option>
      {templates.map((item) => <option key={item.id} value={item.id}>{item.name} · {typeLabels[item.documentType] ?? item.documentType}</option>)}
    </select>
    <select className="field" name="clientId" required value={clientId} onChange={(event) => setClientId(event.target.value)}><option value="" disabled>Paciente</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
    <select className="field" name="professionalId" required value={professionalId} onChange={(event) => setProfessionalId(event.target.value)}><option value="" disabled>Profissional emissor</option>{professionals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
    <input className="field" name="title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={180} placeholder="Título do documento" />
    {selectedTemplate?.documentType === "certificate" && <CidAutocomplete onSelect={addCid} />}
    <TussAutocomplete table="20" label="Guia de medicamentos TUSS 20 (opcional)" nameField="medicationTussCode" onSelect={addMedication} />
    <textarea className="field min-h-72" name="content" value={content} onChange={(event) => setContent(event.target.value)} required maxLength={30000} placeholder="Selecione um modelo e revise todo o conteúdo antes da emissão." />
    <input className="field" name="patientEmail" type="email" placeholder="E-mail do paciente (opcional; usa o cadastro). Sem e-mail, o PDF fica disponível para impressão." />
    <button type="button" className="primary-button w-fit" onClick={(event) => { const form = event.currentTarget.closest("form"); if (form?.reportValidity()) setPreviewOpen(true); }}>Visualizar documento</button>
    {previewOpen ? <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="document-preview-title"><div className="my-6 w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl sm:p-8">
      <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Pré-visualização</p><h2 className="text-2xl font-extrabold" id="document-preview-title">Revise antes de emitir</h2></div><button type="button" className="rounded-xl p-2 hover:bg-slate-100" onClick={() => setPreviewOpen(false)} aria-label="Fechar pré-visualização"><X className="size-5" /></button></div>
      <div className="my-6 rounded-xl border bg-white p-6 shadow-sm sm:p-10"><div className="border-b-2 border-brand pb-4"><p className="text-xl font-extrabold text-brand">{organizationName}</p><p className="mt-1 text-xs text-muted">O PDF final incluirá todos os dados do papel timbrado.</p></div><h3 className="my-6 text-2xl font-extrabold">{title}</h3><div className="whitespace-pre-wrap leading-7">{previewContent}</div><div className="mt-8 border-t pt-4"><p className="font-bold">{professional?.name}</p></div></div>
      <p className="mb-3 text-sm font-extrabold">Como deseja finalizar?</p><div className="grid gap-2 sm:grid-cols-2"><button className="secondary-button justify-start" type="submit" name="deliveryMethod" value="print"><Download className="mr-2 size-4" />Emitir e abrir PDF</button><button className="secondary-button justify-start" type="submit" name="deliveryMethod" value="email"><Mail className="mr-2 size-4" />Emitir e enviar por e-mail</button><button className="secondary-button justify-start" type="submit" name="deliveryMethod" value="whatsapp" disabled={!client?.phone}><MessageCircle className="mr-2 size-4" />Emitir e compartilhar no WhatsApp</button><button className="secondary-button justify-start" type="button" disabled title="Requer integração com certificado ICP-Brasil"><ShieldCheck className="mr-2 size-4" />Assinar digitalmente — em breve</button></div>
    </div></div> : null}
  </>;
}
