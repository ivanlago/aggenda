"use client";

import { useEffect, useState } from "react";

type Item = { id: string; name: string; durationMinutes?: number };

export function BookingForm({
  slug,
  services,
  professionals,
  labels,
  timezone,
}: {
  slug: string;
  services: Item[];
  professionals: Item[];
  labels: { service: string; professional: string; appointment: string };
  timezone: string;
}) {
  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [date, setDate] = useState("");
  const [times, setTimes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!serviceId || !professionalId || !date) {
      return;
    }
    const controller = new AbortController();
    fetch(
      `/api/public/booking/${slug}/availability?date=${date}&serviceId=${serviceId}&professionalId=${professionalId}`,
      { signal: controller.signal }
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setTimes(data.availableTimes);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setMessage(error.message);
      });
    return () => controller.abort();
  }, [date, professionalId, serviceId, slug]);

  async function submit(formData: FormData) {
    setLoading(true);
    setMessage("");
    const response = await fetch(`/api/public/booking/${slug}/appointments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData)),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setMessage(data.error);
      return;
    }
    setTimes([]);
    setMessage(`${labels.appointment} confirmado com sucesso.`);
  }

  const minimumDate = new Date().toISOString().slice(0, 10);
  return (
    <form action={submit} className="mt-8 grid gap-4">
      <select
        className="field"
        name="serviceId"
        value={serviceId}
        onChange={(event) => {
          setServiceId(event.target.value);
          setTimes([]);
        }}
        required
      >
        <option value="">Selecione o {labels.service.toLowerCase()}</option>
        {services.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} · {item.durationMinutes} min
          </option>
        ))}
      </select>
      <select
        className="field"
        name="professionalId"
        value={professionalId}
        onChange={(event) => {
          setProfessionalId(event.target.value);
          setTimes([]);
        }}
        required
      >
        <option value="">Selecione o {labels.professional.toLowerCase()}</option>
        {professionals.map((item) => (
          <option key={item.id} value={item.id}>{item.name}</option>
        ))}
      </select>
      <input
        className="field"
        type="date"
        min={minimumDate}
        value={date}
        onChange={(event) => {
          setDate(event.target.value);
          setTimes([]);
        }}
        required
      />
      <select className="field" name="startsAt" required defaultValue="">
        <option value="">
          {loading ? "Consultando horários..." : "Selecione o horário"}
        </option>
        {times.map((time) => (
          <option key={time} value={time}>
            {new Date(time).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: timezone,
            })}
          </option>
        ))}
      </select>
      <div className="my-2 border-t" />
      <input className="field" name="name" placeholder="Seu nome" required />
      <input className="field" name="phone" type="tel" placeholder="WhatsApp com DDD" required />
      <input className="field" name="email" type="email" placeholder="E-mail (opcional)" />
      <button className="primary-button" disabled={loading || !times.length}>
        Confirmar {labels.appointment.toLowerCase()}
      </button>
      {message && (
        <p className="rounded-xl bg-[#edf7f1] p-3 text-sm font-bold text-brand" role="status">
          {message}
        </p>
      )}
    </form>
  );
}
