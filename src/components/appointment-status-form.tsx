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
    <ActionForm action={action} successMessage="Status atualizado com sucesso.">
      <input type="hidden" name="id" value={appointmentId} />
      <label className="grid gap-2 text-sm font-bold">Situação<select
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
      {status === "cancelled" && (
        <label className="grid min-w-0 gap-2 text-sm font-bold">Motivo do cancelamento<input
          className="field mt-2 py-2"
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
      <button className="secondary-button mt-3">Salvar situação do agendamento</button>
    </ActionForm>
  );
}
