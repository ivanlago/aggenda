"use client";

import { CheckCircle2, LoaderCircle, X, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import type { ReferenceRecord } from "@/lib/reference-records";

export type ActionResult = void | { error?: string; warning?: string; openUrl?: string; record?: ReferenceRecord };

type ActionState = {
  id: number;
  status: "idle" | "success" | "error";
  message: string;
};

const initialState: ActionState = { id: 0, status: "idle", message: "" };

function ActionToast({ state }: { state: ActionState }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 5000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;
  return (
    <div
      className={`fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-3 rounded-2xl border bg-white px-4 py-3 text-sm font-bold shadow-xl ${
        state.status === "error" ? "border-red-200 text-red-700" : "border-brand/20 text-brand"
      }`}
      role={state.status === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      {state.status === "error" ? (
        <XCircle className="size-5 shrink-0" />
      ) : (
        <CheckCircle2 className="size-5 shrink-0" />
      )}
      <span>{state.message}</span>
    </div>
  );
}

export function ActionForm({
  action,
  successMessage,
  className,
  children,
  onSuccess,
  resetOnSuccess = true,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  successMessage: string;
  className?: string;
  children: React.ReactNode;
  onSuccess?: (result: ActionResult) => void;
  resetOnSuccess?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const feedbackId = useId();
  const [dismissedErrorId, setDismissedErrorId] = useState<number | null>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (_previousState, formData) => {
      try {
        const result = await action(formData);
        if (result?.error) {
          return { id: Date.now(), status: "error", message: result.error };
        }
        if (result?.openUrl) window.open(result.openUrl, "_blank", "noopener,noreferrer");
        if (resetOnSuccess) formRef.current?.reset();
        formRef.current?.dispatchEvent(new CustomEvent("aggenda:form-saved", { bubbles: true }));
        router.refresh();
        onSuccess?.(result);
        return { id: Date.now(), status: "success", message: result?.warning ?? successMessage };
      } catch (error) {
        console.error("[action-form] Falha ao executar comando", error instanceof Error ? error.name : "UnknownError");
        return {
          id: Date.now(),
          status: "error",
          message: "Não foi possível concluir. Revise os dados e tente novamente.",
        };
      }
    },
    initialState,
  );

  const errorVisible = state.status === "error" && dismissedErrorId !== state.id;

  useEffect(() => {
    if (state.status === "error") errorRef.current?.focus();
  }, [router, state.id, state.status]);

  return (
    <>
      <form ref={formRef} onSubmit={event => {
        event.preventDefault();
        setDismissedErrorId(null);
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        const formData = new FormData(event.currentTarget, submitter);
        startTransition(() => formAction(formData));
      }} className={className} aria-busy={pending} aria-describedby={errorVisible ? feedbackId : undefined}>
        {errorVisible && <div ref={errorRef} id={feedbackId} tabIndex={-1} role="alert" className="col-span-full flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">
          <span className="min-w-0 flex-1">{state.message}</span>
          <button type="button" className="icon-button shrink-0" aria-label="Fechar aviso de erro" onClick={event => {
            setDismissedErrorId(state.id);
            const form = event.currentTarget.form;
            form?.querySelector<HTMLElement>('button[type="submit"], button:not([type]), input, select, textarea')?.focus();
          }}><X className="size-4" aria-hidden="true" /></button>
        </div>}
        <fieldset className="contents" disabled={pending}>
          {children}
        </fieldset>
      </form>
      {pending && (
        <div
          className="fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-3 rounded-2xl border border-brand/20 bg-white px-4 py-3 text-sm font-bold text-brand shadow-xl"
          role="status"
          aria-live="polite"
        >
          <LoaderCircle className="size-5 shrink-0 animate-spin" />
          <span>Salvando alterações…</span>
        </div>
      )}
      {!pending && state.status === "success" && <ActionToast key={state.id} state={state} />}
    </>
  );
}
