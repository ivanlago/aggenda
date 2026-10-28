"use client";

import { createContext, useContext, type ReactNode } from "react";

export const FormDialogContext = createContext<{
  close: () => void;
  openAuxiliary: (title: string, content: ReactNode, returnFocus?: HTMLElement | null) => void;
  finishAuxiliary: () => void;
} | null>(null);

export function useFormDialog() {
  const context = useContext(FormDialogContext);
  if (!context) throw new Error("Este formulário precisa estar dentro de ModalShell.");
  return context;
}

export function FormActions({ editing = false }: { editing?: boolean }) {
  const { close } = useFormDialog();
  return <div className="col-span-full flex flex-wrap justify-end gap-3 border-t pt-5">
    <button type="button" className="secondary-button" onClick={close}>Cancelar</button>
    <button type="submit" className="primary-button">{editing ? "Salvar alterações" : "Salvar"}</button>
  </div>;
}

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset className="col-span-full grid min-w-0 gap-4 sm:grid-cols-2"><legend className="mb-4 text-base font-extrabold">{title}</legend>{children}</fieldset>;
}
