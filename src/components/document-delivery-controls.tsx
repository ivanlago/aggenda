"use client";

import { Download, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { formatBrazilianPhoneInput, formatPhone } from "@/lib/phone";

export function DocumentDeliveryControls({ email, phone }: { email?: string | null; phone?: string | null }) {
  const [otherEmail, setOtherEmail] = useState(false);
  const [otherPhone, setOtherPhone] = useState(false);
  const [alternateEmail, setAlternateEmail] = useState("");
  const [alternatePhone, setAlternatePhone] = useState("");
  const [error, setError] = useState("");
  const recipientEmail = otherEmail ? alternateEmail.trim() : email?.trim() || "";
  const recipientPhone = otherPhone ? alternatePhone.trim() : phone?.trim() || "";

  function validate(event: MouseEvent<HTMLButtonElement>, method: "email" | "whatsapp") {
    const valid = method === "email"
      ? /^\S+@\S+\.\S+$/.test(recipientEmail)
      : /^\d{10,15}$/.test(recipientPhone.replace(/\D/g, ""));
    if (!valid) {
      event.preventDefault();
      if (method === "email") setOtherEmail(true);
      else setOtherPhone(true);
      setError(method === "email" ? "Informe um e-mail válido para o envio." : "Informe um WhatsApp válido com DDD para o envio.");
    } else setError("");
  }

  return <>
    <input type="hidden" name="patientEmail" value={recipientEmail} />
    <input type="hidden" name="patientPhone" value={recipientPhone} />
    <input type="hidden" name="useAlternateEmail" value={String(otherEmail)} />
    <input type="hidden" name="useAlternatePhone" value={String(otherPhone)} />
    <p className="mb-3 text-sm font-extrabold">Como deseja finalizar?</p>
    <div className="grid gap-2 sm:grid-cols-2">
      <button className="secondary-button justify-start" type="submit" name="deliveryMethod" value="print"><Download className="mr-2 size-4 shrink-0" />Emitir e abrir PDF</button>
      <button className="secondary-button justify-start" type="button" disabled title="Requer integração com certificado ICP-Brasil"><ShieldCheck className="mr-2 size-4 shrink-0" />Assinar digitalmente — em breve</button>
      <button className="secondary-button justify-start" type="submit" name="deliveryMethod" value="whatsapp" onClick={(event) => validate(event, "whatsapp")}><MessageCircle className="mr-2 size-4 shrink-0" /><span className="min-w-0 text-left">Emitir e compartilhar no WhatsApp<span className="block break-words text-xs font-normal">{formatPhone(recipientPhone) || "Telefone não informado"}</span></span></button>
      <button className="secondary-button justify-start" type="submit" name="deliveryMethod" value="email" onClick={(event) => validate(event, "email")}><Mail className="mr-2 size-4 shrink-0" /><span className="min-w-0 text-left">Emitir e enviar por e-mail<span className="block break-all text-xs font-normal">{recipientEmail || "E-mail não informado"}</span></span></button>
    </div>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <div className="grid content-start gap-2">
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={otherPhone} onChange={(event) => { setOtherPhone(event.target.checked); setError(""); }} />Outro número</label>
        {otherPhone && <label className="grid gap-1 text-sm font-bold"><span className="sr-only">Outro número de WhatsApp</span><input className="field" type="tel" inputMode="tel" data-phone-mask="off" value={alternatePhone} onChange={(event) => { setAlternatePhone(formatBrazilianPhoneInput(event.target.value)); setError(""); }} placeholder="(71) 99181-4240" /></label>}
      </div>
      <div className="grid content-start gap-2">
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={otherEmail} onChange={(event) => { setOtherEmail(event.target.checked); setError(""); }} />Outro e-mail</label>
        {otherEmail && <label className="grid gap-1 text-sm font-bold"><span className="sr-only">Outro e-mail</span><input className="field" type="text" inputMode="email" value={alternateEmail} onChange={(event) => { setAlternateEmail(event.target.value); setError(""); }} placeholder="destinatario@exemplo.com" /></label>}
      </div>
    </div>
    {(otherEmail || otherPhone) && <p className="mt-2 text-xs text-muted">O destino alternativo será usado apenas neste envio, sem alterar o cadastro.</p>}
    {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
  </>;
}
