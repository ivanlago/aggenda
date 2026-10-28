"use client";

import { FormDialogContext } from "@/components/form-dialog-context";
import { CircleDollarSign, Pencil, Plus, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export function ModalShell({ title, variant, children, defaultOpen = false, completed = false, wide = false, closeOnSuccess = false, triggerLabel, triggerIcon, secondary = false, compact = false, description, onOpen }: {
  title: string; variant: "new" | "payment" | "edit"; children: React.ReactNode;
  defaultOpen?: boolean; completed?: boolean; wide?: boolean; closeOnSuccess?: boolean;
  triggerLabel?: string; triggerIcon?: React.ReactNode; secondary?: boolean; compact?: boolean; description?: string; onOpen?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [auxiliary, setAuxiliary] = useState<{ title: string; content: React.ReactNode } | null>(null);
  const auxiliaryRef = useRef<HTMLDivElement>(null);
  const auxiliaryTriggerRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null), triggerRef = useRef<HTMLButtonElement>(null), headingRef = useRef<HTMLHeadingElement>(null);
  const dirtyForms = useRef(new Set<HTMLFormElement>());
  const titleId = useId();
  const Icon = variant === "new" ? Plus : variant === "payment" ? CircleDollarSign : Pencil;
  const finishAuxiliary = () => {
    for (const form of dirtyForms.current) if (auxiliaryRef.current?.contains(form)) dirtyForms.current.delete(form);
    setAuxiliary(null);
    requestAnimationFrame(() => auxiliaryTriggerRef.current?.focus());
  };
  useEffect(() => {
    if (auxiliary) headingRef.current?.focus({ preventScroll: true });
  }, [auxiliary]);
  const close = () => {
    if (auxiliary) {
      if ([...dirtyForms.current].some((form) => auxiliaryRef.current?.contains(form)) && !window.confirm("Há alterações não salvas neste cadastro. Deseja cancelar?")) return;
      finishAuxiliary();
      return;
    }
    if (dirtyForms.current.size && !window.confirm("Há alterações não salvas neste formulário. Deseja fechar mesmo assim?")) return;
    dirtyForms.current.clear(); dialogRef.current?.close(); setOpen(false); triggerRef.current?.focus();
  };
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();
    headingRef.current?.focus({ preventScroll: true });
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const saved = (event: Event) => {
      if (!(event.target instanceof HTMLFormElement)) return;
      dirtyForms.current.delete(event.target);
      if (!auxiliaryRef.current?.contains(event.target) && closeOnSuccess && !dirtyForms.current.size) {
        dialog.close(); setOpen(false); triggerRef.current?.focus();
      }
    };
    const unload = (event: BeforeUnloadEvent) => { if (dirtyForms.current.size) { event.preventDefault(); event.returnValue = ""; } };
    dialog.addEventListener("aggenda:form-saved", saved); window.addEventListener("beforeunload", unload);
    return () => { dialog.removeEventListener("aggenda:form-saved", saved); window.removeEventListener("beforeunload", unload); document.body.style.overflow = previousOverflow; };
  }, [open, closeOnSuccess]);
  const context = { close, openAuxiliary: (title: string, content: React.ReactNode, returnFocus?: HTMLElement | null) => {
    auxiliaryTriggerRef.current = returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setAuxiliary({ title, content });
  }, finishAuxiliary };
  return <>
    <button ref={triggerRef} type="button" onClick={() => { setOpen(true); onOpen?.(); }} className={secondary || (triggerLabel && variant === "edit") ? "secondary-button w-fit" : variant === "new" ? "primary-button w-fit" : variant === "payment" ? `icon-button relative border-emerald-200 bg-emerald-50 text-emerald-700 ${completed ? "ring-2 ring-emerald-500" : ""}` : "icon-button"} aria-label={completed ? `${title} — pagamento efetuado` : title}>
      {triggerIcon ?? <Icon className={variant === "payment" ? "size-5" : "size-4"} aria-hidden="true" />}{completed && variant === "payment" && <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-emerald-600 text-[10px] font-black text-white">✓</span>}{(variant === "new" || triggerLabel) && <span>{triggerLabel ?? title}</span>}
    </button>
    {open && <dialog ref={dialogRef} aria-labelledby={titleId} style={{ width: "calc(100% - 2rem)" }} className={`panel m-auto max-h-[calc(100dvh_-_2rem)] overflow-y-auto backdrop:bg-slate-950/60 ${compact || auxiliary ? "max-w-xl" : wide ? "max-w-5xl" : "max-w-3xl"}`} onCancel={event => { event.preventDefault(); close(); }} onClose={() => { setAuxiliary(null); dirtyForms.current.clear(); setOpen(false); triggerRef.current?.focus(); }} onInputCapture={event => { const form = event.target instanceof Element ? event.target.closest("form") : null; if (form) dirtyForms.current.add(form); }} onChangeCapture={event => { const form = event.target instanceof Element ? event.target.closest("form") : null; if (form) dirtyForms.current.add(form); }}>
      <div className="mb-5 flex items-center justify-between gap-3"><h2 ref={headingRef} tabIndex={-1} id={titleId} className="text-xl font-extrabold outline-none">{auxiliary?.title ?? title}</h2><button className="icon-button" type="button" onClick={close} aria-label="Fechar"><X className="size-5" aria-hidden="true" /></button></div>
      <FormDialogContext.Provider value={context}>
        <div hidden={Boolean(auxiliary)} inert={Boolean(auxiliary)}>
          {description && <p className="mb-5 text-sm text-muted">{description}</p>}
          {children}
        </div>
        {auxiliary && <div ref={auxiliaryRef} key={auxiliary.title}>{auxiliary.content}</div>}
      </FormDialogContext.Provider>
    </dialog>}
  </>;
}
