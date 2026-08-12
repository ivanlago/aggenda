"use client";

import { useRef, useState } from "react";

import { ActionForm } from "@/components/action-form";

export function AppointmentRescheduleForm({
  action,
  appointmentId,
  serviceId,
  professionalId,
  timezone,
}: {
  action: (formData: FormData) => Promise<void | { error?: string }>;
  appointmentId: string;
  serviceId: string;
  professionalId: string;
  timezone: string;
}) {
  const [times, setTimes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const requestController = useRef<AbortController | null>(null);
  const minimumDate = new Date().toISOString().slice(0, 10);

  function loadAvailability(date: string) {
    requestController.current?.abort();
    setTimes([]);
    setAvailabilityError("");
    if (!date) return;

    const controller = new AbortController();
    requestController.current = controller;
    setLoading(true);
    const query = new URLSearchParams({
      date,
      serviceId,
      professionalId,
      excludeAppointmentId: appointmentId,
    });

    fetch(`/api/availability?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível consultar os horários.");
        setTimes(data.availableTimes);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setAvailabilityError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }

  return (
    <ActionForm action={action} successMessage="Agendamento remarcado com sucesso." className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <input type="hidden" name="id" value={appointmentId} />
      <input
        className="field py-2"
        type="date"
        min={minimumDate}
        onChange={(event) => loadAvailability(event.target.value)}
        required
      />
      <select className="field py-2" name="startsAt" required defaultValue="" disabled={loading || !times.length}>
        <option value="">
          {loading ? "Consultando horários…" : times.length ? "Selecione o horário" : "Nenhum horário disponível"}
        </option>
        {times.map((time) => (
          <option key={time} value={time}>
            {new Date(time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: timezone })}
          </option>
        ))}
      </select>
      <button className="primary-button py-2" disabled={loading || !times.length}>Salvar</button>
      {availabilityError && <p className="text-sm font-bold text-red-700 sm:col-span-3" role="alert">{availabilityError}</p>}
    </ActionForm>
  );
}
