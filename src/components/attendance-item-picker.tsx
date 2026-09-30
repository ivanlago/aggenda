"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";

export type AttendanceItemOption = { id: string; label: string; source: "package" | "sale"; available: number };
export function AttendanceItemPicker({ appointmentId, options, action }: {
  appointmentId: string;
  options: AttendanceItemOption[];
  action: (data: FormData) => Promise<void | { error?: string; warning?: string; openUrl?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<"package" | "sale">("package");
  const [itemId, setItemId] = useState("");
  const [requestId, setRequestId] = useState("");
  const items = options.filter((item) => item.source === source);
  const selected = items.find((item) => item.id === itemId);
  return <div className="mt-4">
    <button type="button" className="primary-button w-fit" aria-expanded={open} onClick={() => { if (!open) setRequestId(crypto.randomUUID()); setOpen((current) => !current); }}>+ Produto/Procedimento</button>
    {open && <ActionForm action={action} successMessage="Item adicionado ao atendimento." onSuccess={() => { setItemId(""); setOpen(false); }} className="mt-3 grid gap-3 rounded-xl border p-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="quantity" value="1" />
      <label className="grid gap-1 text-sm font-bold">Origem<select className="field" name="source" value={source} onChange={(event) => { setSource(event.target.value as "package" | "sale"); setItemId(""); }}><option value="package">Pacotes</option><option value="sale">À venda</option></select></label>
      <label className="grid min-w-0 gap-1 text-sm font-bold">Item<select className="field" name="itemId" value={itemId} onChange={(event) => setItemId(event.target.value)} required><option value="" disabled>{items.length ? "Selecione o produto/procedimento" : "Nenhum item disponível"}</option>{items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <button className="primary-button" disabled={!selected}>Adicionar</button>
    </ActionForm>}
  </div>;
}
