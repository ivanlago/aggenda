"use client";

import { useState } from "react";

import { ActionForm } from "@/components/action-form";

type AppointmentStatus = "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";

export function AppointmentStatusForm({
  action,
  appointmentId,
  initialStatus,
  initialCancellationReason,
  statuses,
}: {
  action: (formData: FormData) => Promise<void | { error?: string }>;
  appointmentId: string;
  initialStatus: AppointmentStatus;
  initialCancellationReason: string | null;
  statuses: ReadonlyArray<readonly [AppointmentStatus, string]>;
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
      <select
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
      </select>
      {status === "cancelled" && (
        <input
          className="field mt-2 py-2"
          name="cancellationReason"
          value={cancellationReason}
          onChange={(event) => setDraft({
            baselineStatus: initialStatus,
            baselineReason: serverReason,
            status,
            cancellationReason: event.target.value,
          })}
          placeholder="Motivo do cancelamento"
          required
        />
      )}
      <button className="mt-2 w-full text-xs font-extrabold text-brand">Atualizar</button>
    </ActionForm>
  );
}
