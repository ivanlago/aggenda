"use client";

import { useMemo, useRef, useState } from "react";

import { ActionForm } from "@/components/action-form";

type Item = { id: string; name: string };

export function AppointmentCreateForm({
  action,
  clients,
  services,
  professionals,
  serviceProfessionalLinks,
  labels,
}: {
  action: (formData: FormData) => Promise<void>;
  clients: Item[];
  services: Item[];
  professionals: Item[];
  serviceProfessionalLinks: Array<{ serviceId: string; professionalId: string }>;
  labels: { client: string; service: string; professional: string; appointment: string };
}) {
  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [date, setDate] = useState("");
  const [times, setTimes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const requestController = useRef<AbortController | null>(null);
  const eligibleProfessionals = useMemo(() => {
    const linkedIds = new Set(
      serviceProfessionalLinks
        .filter((link) => link.serviceId === serviceId)
        .map((link) => link.professionalId),
    );
    return linkedIds.size
      ? professionals.filter((professional) => linkedIds.has(professional.id))
      : professionals;
  }, [professionals, serviceId, serviceProfessionalLinks]);

  function loadAvailability(nextServiceId: string, nextProfessionalId: string, nextDate: string) {
    requestController.current?.abort();
    setTimes([]);
    if (!nextServiceId || !nextProfessionalId || !nextDate) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    requestController.current = controller;
    setLoading(true);
    setAvailabilityError("");
    fetch(`/api/availability?date=${encodeURIComponent(nextDate)}&serviceId=${nextServiceId}&professionalId=${nextProfessionalId}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível consultar os horários.");
        setTimes(data.availableTimes);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setAvailabilityError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }
  const minimumDate = new Date().toISOString().slice(0, 10);

  return (
    <ActionForm action={action} successMessage={`${labels.appointment} criado com sucesso.`} className="panel form-stack">
      <h2 className="text-lg font-extrabold">Novo {labels.appointment.toLowerCase()}</h2>
      <select className="field" name="clientId" required defaultValue="">
        <option value="" disabled>Selecione o {labels.client.toLowerCase()}</option>
        {clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select className="field" name="serviceId" required value={serviceId} onChange={(event) => { const next = event.target.value; setServiceId(next); setProfessionalId(""); loadAvailability(next, "", date); }}>
        <option value="">Selecione o {labels.service.toLowerCase()}</option>
        {services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select className="field" name="professionalId" required value={professionalId} onChange={(event) => { const next = event.target.value; setProfessionalId(next); loadAvailability(serviceId, next, date); }}>
        <option value="">Selecione o {labels.professional.toLowerCase()}</option>
        {eligibleProfessionals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <input className="field" type="date" min={minimumDate} value={date} onChange={(event) => { const next = event.target.value; setDate(next); loadAvailability(serviceId, professionalId, next); }} required />
      <select className="field" name="startsAt" required defaultValue="" disabled={loading || !times.length}>
        <option value="">{loading ? "Consultando horários…" : times.length ? "Selecione o horário" : "Nenhum horário disponível"}</option>
        {times.map((time) => <option key={time} value={time}>{new Date(time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</option>)}
      </select>
      {availabilityError && <p className="text-sm font-bold text-red-700" role="alert">{availabilityError}</p>}
      <input className="field" name="price" inputMode="decimal" placeholder="Preço em reais (opcional)" />
      <textarea className="field min-h-20" name="notes" placeholder="Observações" />
      <button className="primary-button" disabled={!clients.length || !services.length || !professionals.length || !times.length}>Criar {labels.appointment.toLowerCase()}</button>
    </ActionForm>
  );
}
