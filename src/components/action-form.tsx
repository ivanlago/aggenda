"use client";

import { CheckCircle2, LoaderCircle, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

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
}: {
  action: (formData: FormData) => Promise<void | { error?: string; warning?: string; openUrl?: string }>;
  successMessage: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (_previousState, formData) => {
      try {
        const result = await action(formData);
        if (result?.error) {
          return { id: Date.now(), status: "error", message: result.error };
        }
        if (result?.openUrl) window.open(result.openUrl, "_blank", "noopener,noreferrer");
        router.refresh();
        return { id: Date.now(), status: "success", message: result?.warning ?? successMessage };
      } catch (error) {
        console.error("[action-form] Falha ao executar comando", error);
        return {
          id: Date.now(),
          status: "error",
          message: "Não foi possível concluir. Revise os dados e tente novamente.",
        };
      }
    },
    initialState,
  );

  return (
    <>
      <form action={formAction} className={className} aria-busy={pending}>
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
      {!pending && state.status !== "idle" && <ActionToast key={state.id} state={state} />}
    </>
  );
}
