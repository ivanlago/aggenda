"use client";

import { CircleDollarSign, Pencil, Plus, X } from "lucide-react";
import { useState } from "react";

export function ModalShell({ title, variant, children, defaultOpen = false }: {
  title: string;
  variant: "new" | "payment" | "edit";
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = variant === "new" ? Plus : variant === "payment" ? CircleDollarSign : Pencil;
  return <>
    <button type="button" onClick={() => setOpen(true)} className={variant === "new" ? "primary-button w-full" : "icon-button"} aria-label={title}>
      <Icon className="size-4" />{variant === "new" && <span>Novo Agendamento</span>}
    </button>
    {open && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="panel mx-auto my-6 w-full max-w-3xl">
        <div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-xl font-extrabold">{title}</h2><button className="icon-button" type="button" onClick={() => setOpen(false)} aria-label="Fechar"><X className="size-5" /></button></div>
        {children}
      </div>
    </div>}
  </>;
}
