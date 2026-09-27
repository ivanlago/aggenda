"use client";

import { Download, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { formatPhone } from "@/lib/phone";

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
        <label className="grid gap-1 text-sm font-bold">Destino do WhatsApp
          <select className="field" value={otherPhone ? "other" : "registered"} onChange={(event) => { setOtherPhone(event.target.value === "other"); setError(""); }}>
            <option value="registered">WhatsApp do cadastro</option><option value="other">Outro WhatsApp</option>
          </select>
        </label>
        {otherPhone && <label className="grid gap-1 text-sm font-bold">Outro WhatsApp<input className="field" type="tel" value={alternatePhone} onChange={(event) => { setAlternatePhone(event.target.value); setError(""); }} placeholder="DDD e número do telefone" /></label>}
      </div>
      <div className="grid content-start gap-2">
        <label className="grid gap-1 text-sm font-bold">Destino do e-mail
          <select className="field" value={otherEmail ? "other" : "registered"} onChange={(event) => { setOtherEmail(event.target.value === "other"); setError(""); }}>
            <option value="registered">E-mail do cadastro</option><option value="other">Outro e-mail</option>
          </select>
        </label>
        {otherEmail && <label className="grid gap-1 text-sm font-bold">Outro e-mail<input className="field" type="text" inputMode="email" value={alternateEmail} onChange={(event) => { setAlternateEmail(event.target.value); setError(""); }} placeholder="destinatario@exemplo.com" /></label>}
      </div>
    </div>
    {(otherEmail || otherPhone) && <p className="mt-2 text-xs text-muted">O destino alternativo será usado apenas neste envio, sem alterar o cadastro.</p>}
    {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
  </>;
}
