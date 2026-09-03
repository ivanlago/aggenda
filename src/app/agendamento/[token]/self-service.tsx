"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export function AppointmentSelfService({
  token,
  status,
  timezone,
  bookingHorizonDays,
  bookingUrl,
}: {
  token: string;
  status: string;
  timezone: string;
  bookingHorizonDays: number;
  bookingUrl: string;
}) {
  const router = useRouter();
  const [currentStatus, setCurrentStatus] = useState(status);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [date, setDate] = useState("");
  const [times, setTimes] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState("");
  const [reason, setReason] = useState("");

  const { minimumDate, maximumDate } = useMemo(() => {
    const minimum = new Date();
    const maximum = new Date();
    maximum.setDate(maximum.getDate() + bookingHorizonDays);
    return {
      minimumDate: minimum.toISOString().slice(0, 10),
      maximumDate: maximum.toISOString().slice(0, 10),
    };
  }, [bookingHorizonDays]);

  async function update(action: "confirm" | "cancel" | "reschedule") {
    setLoading(true);
    setMessage("");
    const response = await fetch(`/api/public/appointments/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, startsAt: selectedTime || undefined, reason: reason || undefined }),
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setMessage(result.error);
    setCurrentStatus(result.status);
    setMessage(action === "confirm" ? "Agendamento confirmado." : action === "cancel" ? "Agendamento cancelado." : "Agendamento reagendado com sucesso.");
    if (action === "reschedule") {
      setShowReschedule(false);
      setTimes([]);
      setSelectedTime("");
    }
    router.refresh();
  }

  async function loadTimes(nextDate: string) {
    setDate(nextDate);
    setTimes([]);
    setSelectedTime("");
    setMessage("");
    if (!nextDate) return;
    setLoading(true);
    const response = await fetch(`/api/public/appointments/${token}/availability?date=${encodeURIComponent(nextDate)}`);
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return setMessage(result.error);
    setTimes(result.availableTimes ?? []);
    if (!result.availableTimes?.length) setMessage("Não há horários disponíveis nesta data.");
  }

  if (["cancelled", "completed", "no_show"].includes(currentStatus)) {
    return <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm"><p className="font-bold">Este agendamento não aceita mais alterações.</p>{currentStatus === "cancelled" && <a className="mt-3 inline-flex font-extrabold text-brand" href={bookingUrl}>Fazer um novo agendamento →</a>}</div>;
  }

  return <div className="mt-5">
    <p className="text-sm text-muted">Use esta página pessoal para confirmar, escolher outro horário ou cancelar seu agendamento.</p>
    <div className="mt-4 flex flex-wrap gap-3">
      {currentStatus !== "confirmed" && <button className="primary-button" disabled={loading} onClick={() => update("confirm")}>Confirmar presença</button>}
      <button className="secondary-button" disabled={loading} onClick={() => { setShowReschedule((value) => !value); setMessage(""); }}>Reagendar</button>
    </div>

    {showReschedule && <section className="mt-5 rounded-2xl border p-4">
      <h2 className="font-extrabold">Escolha o novo horário</h2>
      <label className="mt-4 grid gap-2 text-sm font-bold">Nova data
        <input className="field" type="date" min={minimumDate} max={maximumDate} value={date} onChange={(event) => loadTimes(event.target.value)} />
      </label>
      <label className="mt-3 grid gap-2 text-sm font-bold">Horário disponível
        <select className="field" value={selectedTime} onChange={(event) => setSelectedTime(event.target.value)} disabled={loading || !times.length}>
          <option value="">{loading ? "Consultando horários..." : "Selecione o horário"}</option>
          {times.map((time) => <option key={time} value={time}>{new Date(time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: timezone })}</option>)}
        </select>
      </label>
      <button className="primary-button mt-4" disabled={loading || !selectedTime} onClick={() => update("reschedule")}>Confirmar novo horário</button>
    </section>}

    <section className="mt-5 border-t pt-5">
      {!showCancel ? <button className="text-sm font-extrabold text-red-700" disabled={loading} onClick={() => { setShowCancel(true); setShowReschedule(false); setMessage(""); }}>Quero cancelar este agendamento</button> : <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
        <p className="font-extrabold text-red-800">Confirme o cancelamento</p>
        <p className="mt-1 text-sm text-red-800">O horário será liberado para outras pessoas.</p>
        <label className="mt-3 grid gap-2 text-sm font-bold">Motivo do cancelamento (opcional)
          <input className="field bg-white" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: não poderei comparecer" />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="secondary-button text-red-700" disabled={loading} onClick={() => update("cancel")}>Confirmar cancelamento</button>
          <button className="secondary-button" disabled={loading} onClick={() => setShowCancel(false)}>Voltar</button>
        </div>
      </div>}
    </section>
    {message && <p className="mt-4 rounded-xl bg-[#edf7f1] p-3 text-sm font-bold text-brand" role="status">{message}</p>}
  </div>;
}
