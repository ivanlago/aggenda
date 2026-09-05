"use client";

import { useEffect, useId, useState } from "react";
import { PhoneInput } from "@/components/phone-input";

type Item = { id: string; name: string; durationMinutes?: number; priceInCents?: number | null; depositType?: string; depositValue?: number };

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
  const dateInputId = useId();
  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [date, setDate] = useState("");
  const [times, setTimes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultLinks, setResultLinks] = useState<{ paymentUrl?: string; manageUrl?: string }>({});
  const selectedService = services.find((item) => item.id === serviceId);
  const requiresDeposit = selectedService?.depositType && selectedService.depositType !== "none";

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
    setMessage(data.paymentUrl ? `${labels.appointment} reservado. Conclua o sinal para confirmar.` : `${labels.appointment} confirmado com sucesso.`);
    setResultLinks({ paymentUrl: data.paymentUrl, manageUrl: data.manageUrl });
  }

  const minimumDate = new Date().toISOString().slice(0, 10);
  return (
    <form action={submit} className="mt-8 grid min-w-0 grid-cols-1 gap-4">
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
      <div className="min-w-0">
        <label className="mb-2 block text-sm font-bold" htmlFor={dateInputId}>
          Data do agendamento
        </label>
        <input
          id={dateInputId}
          aria-describedby={`${dateInputId}-hint`}
          className="field box-border min-h-12 min-w-0 max-w-full appearance-none text-base text-foreground [color-scheme:light] [&::-webkit-date-and-time-value]:min-h-6 [&::-webkit-date-and-time-value]:text-left"
          type="date"
          min={minimumDate}
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
            setTimes([]);
          }}
          required
        />
        <p id={`${dateInputId}-hint`} className="mt-1 text-xs text-muted">
          Toque no campo para selecionar a data no calendário.
        </p>
      </div>
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
      <PhoneInput name="phone" placeholder="WhatsApp: (71) 99999-9999" autoComplete="tel" required />
      <input className="field" name="email" type="email" placeholder="E-mail (opcional)" />
      <input className="field" name="voucherCode" placeholder="Voucher ou cupom (opcional)" />
      {requiresDeposit && <><input className="field" name="document" inputMode="numeric" placeholder="CPF do responsável pelo pagamento" required /><div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><strong>Reserva com sinal.</strong> O horário fica reservado por 30 minutos e será confirmado após o pagamento seguro na conta Asaas da empresa.</div></>}
      <button className="primary-button" disabled={loading || !times.length}>
        Confirmar {labels.appointment.toLowerCase()}
      </button>
      {message && (
        <p className="rounded-xl bg-[#edf7f1] p-3 text-sm font-bold text-brand" role="status">
          {message}
        </p>
      )}
      {(resultLinks.paymentUrl || resultLinks.manageUrl) && <div className="flex flex-wrap gap-2">{resultLinks.paymentUrl && <a className="primary-button" href={resultLinks.paymentUrl}>Pagar sinal</a>}{resultLinks.manageUrl && <a className="secondary-button" href={resultLinks.manageUrl}>Gerenciar agendamento</a>}</div>}
    </form>
  );
}
