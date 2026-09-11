"use client";

import { useState } from "react";

export function CompanionDeclaration({ clientName, date }: { clientName: string; date: string }) {
  const [name, setName] = useState("");
  const [period, setPeriod] = useState("");
  const content = `Declaro, para os devidos fins, que ${name} acompanhou ${clientName} em atendimento na {{clinica}}, em ${date}, no período de ${period}.\n\nProfissional responsável: {{profissional}}.`;
  return <>
    <input type="hidden" name="attendanceDocumentType" value="companion_declaration" />
    <input type="hidden" name="content" value={content} />
    <label className="grid gap-2 text-sm font-bold">Nome completo do acompanhante<input className="field" required maxLength={180} value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label className="grid gap-2 text-sm font-bold">Período de acompanhamento<input className="field" required maxLength={100} placeholder="Ex.: das 14h às 15h30" value={period} onChange={(event) => setPeriod(event.target.value)} /></label>
    <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm">{content.replace("{{clinica}}", "esta clínica").replace("{{profissional}}", "profissional do atendimento")}</p>
    <button className="primary-button w-fit">Emitir declaração e abrir PDF</button>
  </>;
}
