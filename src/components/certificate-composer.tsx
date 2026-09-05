"use client";

import { Download, Mail, MessageCircle, ShieldCheck, X } from "lucide-react";
import { useMemo, useState } from "react";

import { CidAutocomplete, type CidItem } from "@/components/cid-autocomplete";

type Option = { id: string; name: string; email?: string | null; phone?: string | null };

const monthNames = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function formatCpf(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function longDate(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  return `${date.getDate()} de ${monthNames[date.getMonth()]} de ${date.getFullYear()}`;
}

export function CertificateComposer({ templateId, clients, professionals }: {
  templateId: string;
  clients: Option[];
  professionals: Option[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [clientId, setClientId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [cpf, setCpf] = useState("");
  const [days, setDays] = useState("1");
  const [daysInWords, setDaysInWords] = useState("um");
  const [startDate, setStartDate] = useState(today);
  const [city, setCity] = useState("");
  const [cidAuthorized, setCidAuthorized] = useState(false);
  const [cid, setCid] = useState<CidItem | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const client = clients.find((item) => item.id === clientId);
  const professional = professionals.find((item) => item.id === professionalId);
  const content = useMemo(() => [
    `Atesto para os devidos fins que o(a) Sr.(a) ${client?.name ?? ""}, portador(a) do CPF nº ${cpf}, esteve sob meus cuidados médicos nesta data e necessita de afastamento de suas atividades laborais/escolares por ${daysInWords} (${days}) dia${days === "1" ? "" : "s"}, a contar de ${longDate(startDate)}, por apresentar incapacidade temporária para o trabalho.`,
    cidAuthorized && cid ? `CID: ${cid.code}` : "",
    `${city}, ${longDate(today)}.`,
  ].filter(Boolean).join("\n\n"), [cid, cidAuthorized, city, client?.name, cpf, days, daysInWords, startDate, today]);
  const valid = Boolean(clientId && professionalId && cpf.replace(/\D/g, "").length === 11 && Number(days) > 0 && daysInWords.trim() && startDate && city.trim() && (!cidAuthorized || cid));
  const missingFields = [
    !clientId && "paciente", !professionalId && "médico emissor",
    cpf.replace(/\D/g, "").length !== 11 && "CPF com 11 dígitos", !(Number(days) > 0) && "dias de afastamento",
    !daysInWords.trim() && "número por extenso", !startDate && "início do afastamento",
    !city.trim() && "cidade de emissão", cidAuthorized && !cid && "CID selecionado na lista de resultados",
  ].filter(Boolean) as string[];

  return <>
    <input type="hidden" name="templateId" value={templateId} />
    <input type="hidden" name="title" value="ATESTADO MÉDICO" />
    <input type="hidden" name="content" value={content} />
    <select className="field" name="clientId" required value={clientId} onChange={(event) => { setClientId(event.target.value); setValidationMessage(""); }}><option value="" disabled>Paciente</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
    <select className="field" name="professionalId" required value={professionalId} onChange={(event) => { setProfessionalId(event.target.value); setValidationMessage(""); }}><option value="" disabled>Médico emissor</option>{professionals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
    <label className="grid gap-1 text-sm font-bold">CPF do paciente<input className="field" inputMode="numeric" value={cpf} onChange={(event) => setCpf(formatCpf(event.target.value))} placeholder="000.000.000-00" required /></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-bold">Dias de afastamento<input className="field" type="number" min="1" max="365" value={days} onChange={(event) => setDays(event.target.value)} required /></label><label className="grid gap-1 text-sm font-bold">Número por extenso<input className="field" value={daysInWords} onChange={(event) => setDaysInWords(event.target.value)} placeholder="Ex.: três" required /></label></div>
    <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-bold">Início do afastamento<input className="field" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></label><label className="grid gap-1 text-sm font-bold">Cidade de emissão<input className="field" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Ex.: Salvador" required /></label></div>
    <label className="flex items-start gap-3 rounded-xl border bg-slate-50 p-3 text-sm"><input className="mt-1" type="checkbox" checked={cidAuthorized} onChange={(event) => { setCidAuthorized(event.target.checked); if (!event.target.checked) setCid(null); }} /><span><strong>Incluir CID</strong><br />Marque somente após obter autorização expressa do paciente.</span></label>
    {cidAuthorized ? <CidAutocomplete onSelect={setCid} /> : null}
    <input className="field" name="patientEmail" type="email" placeholder="E-mail do paciente (opcional; usa o cadastro)" />
    {validationMessage && <p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800" role="alert">{validationMessage}</p>}
    <button type="button" className="primary-button w-fit" onClick={() => { if (!valid) { setValidationMessage(`Revise os campos: ${missingFields.join(", ")}.`); return; } setValidationMessage(""); setPreviewOpen(true); }}>Visualizar atestado</button>
    {previewOpen ? <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="certificate-preview-title"><div className="my-6 w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl sm:p-8">
      <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Pré-visualização</p><h2 className="text-2xl font-extrabold" id="certificate-preview-title">Revise antes de emitir</h2></div><button type="button" className="rounded-xl p-2 hover:bg-slate-100" onClick={() => setPreviewOpen(false)} aria-label="Fechar pré-visualização"><X className="size-5" /></button></div>
      <div className="my-6 rounded-xl border bg-white p-6 shadow-sm sm:p-10"><h3 className="mb-8 text-center text-xl font-extrabold">ATESTADO MÉDICO</h3><div className="whitespace-pre-wrap leading-7">{content}</div><div className="mt-16 border-t pt-3 text-center"><p className="font-bold">{professional?.name}</p><p className="text-sm text-muted">Carimbo e assinatura</p></div></div>
      <p className="mb-3 text-sm font-extrabold">Como deseja finalizar?</p><div className="grid gap-2 sm:grid-cols-2"><button className="secondary-button justify-start" type="submit" name="deliveryMethod" value="print"><Download className="mr-2 size-4" />Emitir e abrir PDF</button><button className="secondary-button justify-start" type="submit" name="deliveryMethod" value="email"><Mail className="mr-2 size-4" />Emitir e enviar por e-mail</button><button className="secondary-button justify-start" type="submit" name="deliveryMethod" value="whatsapp" disabled={!client?.phone}><MessageCircle className="mr-2 size-4" />Emitir e compartilhar no WhatsApp</button><button className="secondary-button justify-start" type="button" disabled title="Requer integração com certificado ICP-Brasil"><ShieldCheck className="mr-2 size-4" />Assinar digitalmente — em breve</button></div>
    </div></div> : null}
  </>;
}
