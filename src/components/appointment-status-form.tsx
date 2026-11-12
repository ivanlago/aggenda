"use client";

import { useState, type ReactNode } from "react";

import { ActionForm } from "@/components/action-form";

type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";

export function AppointmentStatusForm({
  action,
  appointmentId,
  initialStatus,
  initialCancellationReason,
  statuses,
  returnSettings,
}: {
  action: (formData: FormData) => Promise<void | { error?: string }>;
  appointmentId: string;
  initialStatus: AppointmentStatus;
  initialCancellationReason: string | null;
  statuses: ReadonlyArray<readonly [AppointmentStatus, string]>;
  returnSettings?: ReactNode;
}) {
  const serverReason = initialCancellationReason ?? "";
  const [draft, setDraft] = useState({
    baselineStatus: initialStatus,
    baselineReason: serverReason,
    status: initialStatus,
    cancellationReason: serverReason,
  });
  const serverValueChanged =
    draft.baselineStatus !== initialStatus || draft.baselineReason !== serverReason;
  const status = serverValueChanged ? initialStatus : draft.status;
  const cancellationReason = serverValueChanged ? serverReason : draft.cancellationReason;

  return (
    <ActionForm action={action} successMessage={status === "cancelled" ? "Agendamento cancelado com sucesso." : "Situação atualizada com sucesso."} className="grid min-w-0 gap-4">
      <input type="hidden" name="id" value={appointmentId} />
      <div className="flex flex-wrap items-end gap-3">
      <label className="grid min-w-0 flex-1 basis-56 gap-2 text-sm font-bold">Situação<select
        className="field py-2"
        name="status"
        value={status}
        onChange={(event) => setDraft({
          baselineStatus: initialStatus,
          baselineReason: serverReason,
          status: event.target.value as AppointmentStatus,
          cancellationReason,
        })}
      >
        {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <button className={`primary-button ${status === "cancelled" ? "bg-red-700 hover:bg-red-800" : ""}`}>{status === "cancelled" ? "Confirmar cancelamento" : "Salvar situação do agendamento"}</button>
      </div>
      {status === "cancelled" && (
        <label className="grid min-w-0 gap-2 text-sm font-bold">Motivo do cancelamento *<input
          className="field py-2"
          name="cancellationReason"
          value={cancellationReason}
          onChange={(event) => setDraft({
            baselineStatus: initialStatus,
            baselineReason: serverReason,
            status,
            cancellationReason: event.target.value,
          })}
          aria-label="Motivo do cancelamento"
          placeholder="Motivo do cancelamento"
          required
        /></label>
      )}
      {status === "completed" && returnSettings}

    </ActionForm>
  );
}
