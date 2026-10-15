"use client";

import { CircleDollarSign, Pencil, Plus, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export function ModalShell({ title, variant, children, defaultOpen = false, completed = false, wide = false }: {
  title: string; variant: "new" | "payment" | "edit"; children: React.ReactNode;
  defaultOpen?: boolean; completed?: boolean; wide?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const dialogRef = useRef<HTMLDialogElement>(null), triggerRef = useRef<HTMLButtonElement>(null), headingRef = useRef<HTMLHeadingElement>(null);
  const dirtyForms = useRef(new Set<HTMLFormElement>());
  const titleId = useId();
  const Icon = variant === "new" ? Plus : variant === "payment" ? CircleDollarSign : Pencil;
  const close = () => {
    if (dirtyForms.current.size && !window.confirm("Há alterações não salvas neste formulário. Deseja fechar mesmo assim?")) return;
    dirtyForms.current.clear(); dialogRef.current?.close(); setOpen(false); triggerRef.current?.focus();
  };
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();
    headingRef.current?.focus({ preventScroll: true });
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const saved = (event: Event) => { if (event.target instanceof HTMLFormElement) dirtyForms.current.delete(event.target); };
    const unload = (event: BeforeUnloadEvent) => { if (dirtyForms.current.size) { event.preventDefault(); event.returnValue = ""; } };
    dialog.addEventListener("aggenda:form-saved", saved); window.addEventListener("beforeunload", unload);
    return () => { dialog.removeEventListener("aggenda:form-saved", saved); window.removeEventListener("beforeunload", unload); document.body.style.overflow = previousOverflow; };
  }, [open]);
  return <>
    <button ref={triggerRef} type="button" onClick={() => setOpen(true)} className={variant === "new" ? "primary-button w-full" : variant === "payment" ? `icon-button relative border-emerald-200 bg-emerald-50 text-emerald-700 ${completed ? "ring-2 ring-emerald-500" : ""}` : "icon-button"} aria-label={completed ? `${title} — pagamento efetuado` : title}>
      <Icon className={variant === "payment" ? "size-5" : "size-4"} aria-hidden="true" />{completed && variant === "payment" && <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-emerald-600 text-[10px] font-black text-white">✓</span>}{variant === "new" && <span>{title}</span>}
    </button>
    {open && <dialog ref={dialogRef} aria-labelledby={titleId} style={{ width: "calc(100% - 2rem)" }} className={`panel m-auto max-h-[calc(100dvh_-_2rem)] overflow-y-auto backdrop:bg-slate-950/60 ${wide ? "max-w-5xl" : "max-w-3xl"}`} onCancel={event => { event.preventDefault(); close(); }} onClose={() => { setOpen(false); triggerRef.current?.focus(); }} onInputCapture={event => { const form = event.target instanceof Element ? event.target.closest("form") : null; if (form) dirtyForms.current.add(form); }} onChangeCapture={event => { const form = event.target instanceof Element ? event.target.closest("form") : null; if (form) dirtyForms.current.add(form); }}>
      <div className="mb-5 flex items-center justify-between gap-3"><h2 ref={headingRef} tabIndex={-1} id={titleId} className="text-xl font-extrabold outline-none">{title}</h2><button className="icon-button" type="button" onClick={close} aria-label="Fechar"><X className="size-5" aria-hidden="true" /></button></div>
      {children}
    </dialog>}
  </>;
}
