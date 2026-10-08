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
  packageBalances,
  labels,
  timezone,
  rooms = [],
}: {
  action: (formData: FormData) => Promise<void | { error?: string }>;
  clients: Item[];
  services: Item[];
  professionals: Item[];
  serviceProfessionalLinks: Array<{ serviceId: string; professionalId: string }>;
  packageBalances: Array<{ clientPackageId: string; clientId: string; serviceId: string; packageName: string; remaining: number; expiresAt: string | null }>;
  labels: { client: string; service: string; professional: string; appointment: string };
  timezone: string;
  rooms?: Array<{ id: string; name: string; isActive: boolean }>;
}) {
  const [roomId, setRoomId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [clientId, setClientId] = useState("");
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
  const eligiblePackages = useMemo(
    () => packageBalances.filter((item) => item.clientId === clientId && item.serviceId === serviceId),
    [clientId, packageBalances, serviceId]
  );

  function loadAvailability(nextServiceId: string, nextProfessionalId: string, nextDate: string, nextRoomId = roomId) {
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
    fetch(`/api/availability?date=${encodeURIComponent(nextDate)}&serviceId=${nextServiceId}&professionalId=${nextProfessionalId}&roomId=${encodeURIComponent(nextRoomId)}`, { signal: controller.signal })
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
      <select className="field" name="clientId" required value={clientId} onChange={(event) => setClientId(event.target.value)}>
        <option value="" disabled>Selecione o {labels.client.toLowerCase()}</option>
        {clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select className="field" name="serviceId" required value={serviceId} onChange={(event) => { const next = event.target.value; setServiceId(next); setProfessionalId(""); loadAvailability(next, "", date); }}>
        <option value="">Selecione o {labels.service.toLowerCase()}</option>
        {services.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <label className="grid gap-2 text-sm font-bold">
        Usar saldo de pacote (opcional)
        <select className="field" name="clientPackageId" defaultValue="" key={`${clientId}:${serviceId}`}>
          <option value="">Atendimento avulso</option>
          {eligiblePackages.map((item) => (
            <option key={item.clientPackageId} value={item.clientPackageId}>
              {item.packageName} · {item.remaining} {item.remaining === 1 ? "sessão disponível" : "sessões disponíveis"}
            </option>
          ))}
        </select>
        {clientId && serviceId && !eligiblePackages.length && <span className="text-xs font-normal text-muted">Este cliente não possui saldo de pacote para o serviço selecionado.</span>}
      </label>
      <select className="field" name="professionalId" required value={professionalId} onChange={(event) => { const next = event.target.value; setProfessionalId(next); loadAvailability(serviceId, next, date); }}>
        <option value="">Selecione o {labels.professional.toLowerCase()}</option>
        {eligibleProfessionals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      {rooms.length > 0 && <label className="grid gap-2 text-sm font-bold">Sala<select className="field" name="roomId" value={roomId} onChange={event => { const next = event.target.value; setRoomId(next); loadAvailability(serviceId, professionalId, date, next); }}><option value="">Selecionar sala disponível automaticamente</option>{rooms.filter(room => room.isActive).map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>}
      <input className="field" type="date" min={minimumDate} value={date} onChange={(event) => { const next = event.target.value; setDate(next); loadAvailability(serviceId, professionalId, next); }} required />
      <select key={`${date}:${serviceId}:${professionalId}:${roomId}`} className="field" name="startsAt" required defaultValue="" disabled={loading || !times.length}>
        <option value="">{loading ? "Consultando horários…" : times.length ? "Selecione o horário" : "Nenhum horário disponível"}</option>
        {times.map((time) => <option key={time} value={time}>{new Date(time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: timezone })}</option>)}
      </select>
      {availabilityError && <p className="text-sm font-bold text-red-700" role="alert">{availabilityError}</p>}
      <input className="field" name="price" inputMode="decimal" placeholder="Preço em reais (opcional)" />
      <textarea className="field min-h-20" name="notes" placeholder="Observações" />
      <button className="primary-button" disabled={!clients.length || !services.length || !professionals.length || !times.length}>Criar {labels.appointment.toLowerCase()}</button>
    </ActionForm>
  );
}
