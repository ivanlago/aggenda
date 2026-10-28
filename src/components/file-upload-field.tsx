"use client";
import { useId, useState } from "react";

export function FileUploadField({ name, label, accept, required = false }: { name: string; label: string; accept: string; required?: boolean }) {
  const id = useId();
  const [filename, setFilename] = useState("");
  return <div className="grid min-w-0 gap-2 text-sm"><label className="font-bold" htmlFor={id}>{label}</label>
    <div className="relative flex min-w-0 flex-wrap items-center gap-3 rounded-lg border p-3 focus-within:ring-2 focus-within:ring-brand">
      <input id={id} name={name} type="file" accept={accept} required={required} className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0" onChange={event => setFilename(event.target.files?.[0]?.name ?? "")} />
      <span aria-hidden="true" className="secondary-button">Selecionar arquivo</span><span className="min-w-0 break-all" aria-live="polite">{filename || "Nenhum arquivo selecionado"}</span>
    </div>
  </div>;
}
