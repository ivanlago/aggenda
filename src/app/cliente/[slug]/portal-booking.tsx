"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Service = { id: string; name: string; durationMinutes: number; priceInCents: number | null; professionalIds: string[] };
type Professional = { id: string; name: string };

export function PortalBooking({ slug, services, professionals, timezone, horizonDays, hasUpcoming }: { slug: string; services: Service[]; professionals: Professional[]; timezone: string; horizonDays: number; hasUpcoming: boolean }) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [date, setDate] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [times, setTimes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const selectedService = services.find((item) => item.id === serviceId);
  const eligible = useMemo(() => selectedService?.professionalIds.length ? professionals.filter((item) => selectedService.professionalIds.includes(item.id)) : professionals, [professionals, selectedService]);
  const minimumDate = new Date().toISOString().slice(0, 10);
  const maximum = new Date(); maximum.setDate(maximum.getDate() + horizonDays);

  async function loadDate(nextDate: string) {
    setDate(nextDate); setTimes([]); setStartsAt(""); setMessage("");
    if (!nextDate || !serviceId || !professionalId) return;
    setLoading(true);
    const response = await fetch(`/api/public/booking/${slug}/availability?date=${nextDate}&serviceId=${serviceId}&professionalId=${professionalId}`);
    const result = await response.json(); setLoading(false);
    if (!response.ok) return setMessage(result.error);
    setTimes(result.availableTimes || []);
    if (!result.availableTimes?.length) setMessage("Não encontramos horários disponíveis nesta data. Escolha outro dia.");
  }

  async function submit() {
    setLoading(true); setMessage("");
    const response = await fetch(`/api/public/booking/${slug}/appointments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceId, professionalId, startsAt }) });
    const result = await response.json(); setLoading(false);
    if (!response.ok) return setMessage(result.error);
    setServiceId(""); setProfessionalId(""); setDate(""); setStartsAt(""); setTimes([]);
    setMessage("Agendamento realizado com sucesso."); router.refresh();
  }

  return <div className="mt-5 grid gap-5">
    {hasUpcoming && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm"><strong>Você já possui agendamento futuro.</strong><p className="mt-1 text-amber-900">Confira-o acima antes de criar outro horário.</p></div>}
    <div className="grid gap-2"><p className="text-xs font-extrabold uppercase tracking-widest text-brand">Etapa 1</p><label className="font-extrabold">Qual procedimento você deseja?</label><select className="field" value={serviceId} onChange={(event) => { setServiceId(event.target.value); setProfessionalId(""); setDate(""); setTimes([]); }}><option value="">Selecione o procedimento</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.durationMinutes} min{item.priceInCents != null ? ` · ${(item.priceInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}</option>)}</select></div>
    {serviceId && <div className="grid gap-2"><p className="text-xs font-extrabold uppercase tracking-widest text-brand">Etapa 2</p><label className="font-extrabold">Escolha um profissional habilitado</label><select className="field" value={professionalId} onChange={(event) => { setProfessionalId(event.target.value); setDate(""); setTimes([]); }}><option value="">Selecione o profissional</option>{eligible.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{!eligible.length && <p className="text-sm text-red-700">Nenhum profissional está habilitado para este procedimento.</p>}</div>}
    {professionalId && <div className="grid gap-2"><p className="text-xs font-extrabold uppercase tracking-widest text-brand">Etapa 3</p><label className="font-extrabold">Escolha a data</label><input className="field min-h-12 text-base [color-scheme:light]" type="date" min={minimumDate} max={maximum.toISOString().slice(0, 10)} value={date} onChange={(event) => loadDate(event.target.value)} /></div>}
    {date && <div className="grid gap-2"><p className="text-xs font-extrabold uppercase tracking-widest text-brand">Etapa 4</p><label className="font-extrabold">Horários disponíveis em tempo real</label>{loading ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted">Consultando a agenda...</p> : <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{times.map((time) => <button type="button" key={time} onClick={() => setStartsAt(time)} className={`rounded-xl border px-3 py-3 text-sm font-extrabold transition ${startsAt === time ? "border-brand bg-brand text-white" : "bg-white hover:border-brand"}`}>{new Date(time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: timezone })}</button>)}</div>}</div>}
    {startsAt && <div className="rounded-2xl border bg-[#f8faf7] p-4"><p className="font-extrabold">Revise antes de confirmar</p><p className="mt-2 text-sm text-muted">{selectedService?.name} · {eligible.find((item) => item.id === professionalId)?.name} · {new Date(startsAt).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: timezone })}</p><button className="primary-button mt-4 w-full sm:w-auto" disabled={loading} onClick={submit}>Confirmar agendamento</button></div>}
    {message && <p className="rounded-xl bg-[#edf7f1] p-3 text-sm font-bold text-brand" role="status">{message}</p>}
  </div>;
}
