"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { organizationDate } from "@/lib/organization-time";
import { BookingVoucher, type VoucherQuote } from "@/components/booking-voucher";

type Service = { id: string; name: string; durationMinutes: number; priceInCents: number | null; professionalIds: string[]; depositType: string; repeatPolicy: string };
type Upcoming = { id: string; serviceId: string; startsAt: string; endsAt: string; service: string; manageUrl?: string };
type Professional = { id: string; name: string };

export function PortalBooking({ slug, services, professionals, timezone, horizonDays, hasUpcoming, patientId, patientName, upcoming, initialVoucherCode = "", initialServiceId = "" }: { slug: string; services: Service[]; professionals: Professional[]; timezone: string; horizonDays: number; hasUpcoming: boolean; patientId: string; patientName: string; upcoming: Upcoming[]; initialVoucherCode?: string; initialServiceId?: string }) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState(() => services.some(service => service.id === initialServiceId) ? initialServiceId : "");
  const [professionalId, setProfessionalId] = useState("");
  const [date, setDate] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [times, setTimes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [document, setDocument] = useState("");
  const [voucherPending, setVoucherPending] = useState(false);
  const [voucherQuote, setVoucherQuote] = useState<VoucherQuote | null>(null);
  const [paymentUrl, setPaymentUrl] = useState("");
  const [manageUrl, setManageUrl] = useState("");
  const [repeatConfirmed, setRepeatConfirmed] = useState(false);
  const [serverRepeats, setServerRepeats] = useState<Array<{ id: string; startsAt: string; manageUrl?: string }>>([]);
  const submitting = useRef(false);
  const serviceInput = useId();
  const professionalInput = useId();
  const dateInput = useId();
  const availabilityRequest = useRef<AbortController | null>(null);
  useEffect(() => () => availabilityRequest.current?.abort(), []);
  function resetAvailability() {
    availabilityRequest.current?.abort(); setLoading(false);
    setDate(""); setStartsAt(""); setTimes([]); setMessage("");
  }
  const selectedService = services.find((item) => item.id === serviceId);
  const eligible = useMemo(() => selectedService?.professionalIds.length ? professionals.filter((item) => selectedService.professionalIds.includes(item.id)) : professionals, [professionals, selectedService]);
  const repeats = [...upcoming.filter(item => item.serviceId === serviceId), ...serverRepeats].filter((item, index, all) => all.findIndex(other => other.id === item.id) === index);
  const repeatBlocked = repeats.length > 0 && selectedService?.repeatPolicy === "block";
  const minimumDate = organizationDate(new Date(), timezone);
  const maximum = new Date(`${minimumDate}T12:00:00Z`); maximum.setUTCDate(maximum.getUTCDate() + horizonDays);

  async function loadDate(nextDate: string) {
    availabilityRequest.current?.abort(); setLoading(false);
    setDate(nextDate); setTimes([]); setStartsAt(""); setMessage("");
    if (!nextDate || !serviceId || !professionalId) return;
    availabilityRequest.current?.abort();
    const controller = new AbortController(); availabilityRequest.current = controller;
    setLoading(true);
    try {
      const response = await fetch(`/api/public/booking/${slug}/availability?date=${nextDate}&serviceId=${serviceId}&professionalId=${professionalId}&patientId=${patientId}`, { signal: controller.signal });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) return setMessage(result.error);
      setTimes(result.availableTimes || []);
      if (!result.availableTimes?.length) setMessage("Não encontramos horários disponíveis nesta data. Escolha outro dia ou profissional.");
    } catch {
      if (!controller.signal.aborted) setMessage("Não foi possível consultar os horários. Tente novamente.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  async function submit() {
    if (submitting.current || repeatBlocked || (repeats.length > 0 && !repeatConfirmed)) return;
    submitting.current = true;
    setLoading(true); setMessage(""); setManageUrl("");
    try {
      const response = await fetch(`/api/public/booking/${slug}/appointments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientId, serviceId, professionalId, startsAt, document, acknowledgedAppointmentIds: repeatConfirmed ? repeats.map(item => item.id) : [], voucherCode: voucherQuote?.code || "" }) });
      const result = await response.json().catch(() => null);
      if (result?.code === "SERVICE_REPEAT_CONFIRMATION" || result?.code === "SERVICE_REPEAT_BLOCKED") { setServerRepeats(result.existingAppointments || []); setRepeatConfirmed(false); }
      if (!response.ok || !result) throw new Error(result?.error || "Não foi possível concluir o agendamento. Tente novamente.");
      setServiceId(""); setProfessionalId(""); setDate(""); setStartsAt(""); setTimes([]); setVoucherQuote(null); setRepeatConfirmed(false); setServerRepeats([]);
      setPaymentUrl(result.paymentUrl || ""); setManageUrl(result.manageUrl || "");
      setMessage(result.existing ? (result.depositPending && !result.paymentUrl ? "Esta reserva já existe. A geração do sinal pode estar em processamento; consulte a reserva ou fale com a clínica. Não é necessário agendar novamente." : "Esta reserva já existe. Nenhum agendamento duplicado foi criado.") : result.paymentUrl ? "Horário reservado. Conclua o pagamento do sinal para confirmar." : "Agendamento realizado com sucesso."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível concluir o agendamento."); }
    finally { submitting.current = false; setLoading(false); }
  }

  return <div className="mt-5 grid gap-5">
    {hasUpcoming && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm"><strong>{patientName} já possui agendamento futuro.</strong><p className="mt-1 text-amber-900">Confira as reservas antes de criar outro horário.</p><a className="mt-2 inline-block font-bold underline" href="#proximos-agendamentos">Consultar, reagendar ou cancelar reservas existentes</a></div>}
    <div className="grid gap-2"><p className="text-xs font-extrabold uppercase tracking-widest text-brand">Etapa 1</p><label htmlFor={serviceInput} className="font-extrabold">Qual procedimento você deseja?</label><select id={serviceInput} className="field" value={serviceId} onChange={(event) => { setServiceId(event.target.value); setProfessionalId(""); setRepeatConfirmed(false); setServerRepeats([]); setVoucherQuote(null); setVoucherPending(false); resetAvailability(); }}><option value="">Selecione o procedimento</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.durationMinutes} min{item.priceInCents != null ? ` · ${(item.priceInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}</option>)}</select></div>
    {repeats.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"><p className="font-bold">{repeatBlocked ? "Já existe uma reserva futura deste procedimento." : "Confira: este procedimento já está agendado."}</p><ul className="mt-2 grid gap-2">{repeats.map(item => <li key={item.id}>{new Date(item.startsAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: timezone })}{item.manageUrl && <> · <a className="font-bold underline" href={item.manageUrl}>Gerenciar reserva</a></>}</li>)}</ul>{repeatBlocked ? <p className="mt-2">A clínica permite apenas uma reserva futura por procedimento. Reagende a existente ou fale com a equipe.</p> : <label className="mt-3 flex items-start gap-2"><input type="checkbox" checked={repeatConfirmed} onChange={event => setRepeatConfirmed(event.target.checked)} />Conferi as reservas e desejo agendar outra sessão deste procedimento.</label>}</div>}
    {serviceId && <BookingVoucher patientId={patientId} key={serviceId} slug={slug} serviceId={serviceId} initialCode={initialVoucherCode} onChange={setVoucherQuote} onPendingChange={setVoucherPending} />}
    {serviceId && <div className="grid gap-2"><p className="text-xs font-extrabold uppercase tracking-widest text-brand">Etapa 2</p><label htmlFor={professionalInput} className="font-extrabold">Escolha um profissional habilitado</label><select id={professionalInput} className="field" value={professionalId} onChange={(event) => { setProfessionalId(event.target.value); resetAvailability(); }}><option value="">Selecione o profissional</option>{eligible.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{!eligible.length && <p className="text-sm text-red-700">Nenhum profissional está habilitado para este procedimento.</p>}</div>}
    {professionalId && <div className="grid gap-2"><p className="text-xs font-extrabold uppercase tracking-widest text-brand">Etapa 3</p><label htmlFor={dateInput} className="font-extrabold">Escolha a data</label><input id={dateInput} className="field min-h-12 text-base [color-scheme:light]" type="date" min={minimumDate} max={maximum.toISOString().slice(0, 10)} value={date} onChange={(event) => loadDate(event.target.value)} /></div>}
    {date && <div className="grid gap-2"><p className="text-xs font-extrabold uppercase tracking-widest text-brand">Etapa 4</p><label className="font-extrabold">Horários disponíveis em tempo real</label>{loading ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted">Consultando a agenda...</p> : <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{times.filter(time => !upcoming.some(item => new Date(time).getTime() < new Date(item.endsAt).getTime() && new Date(time).getTime() + (selectedService?.durationMinutes || 0) * 60_000 > new Date(item.startsAt).getTime())).map((time) => <button type="button" key={time} onClick={() => setStartsAt(time)} className={`rounded-xl border px-3 py-3 text-sm font-extrabold transition ${startsAt === time ? "border-brand bg-brand text-white" : "bg-white hover:border-brand"}`}>{new Date(time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: timezone })}</button>)}</div>}</div>}
    {startsAt && <div className="rounded-2xl border bg-[#f8faf7] p-4"><p className="font-extrabold">Revise antes de confirmar</p><p className="mt-2 text-sm text-muted">{selectedService?.name} · {eligible.find((item) => item.id === professionalId)?.name} · {new Date(startsAt).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: timezone })}</p>{voucherQuote && <p className="mt-2 text-sm font-bold text-brand">Voucher {voucherQuote.code} · Total com desconto: {(voucherQuote.finalPriceInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>}{selectedService?.depositType !== "none" && <label className="mt-4 grid gap-2 text-sm font-bold">CPF ou CNPJ do responsável pelo pagamento<input className="field" inputMode="numeric" value={document} onChange={(event) => setDocument(event.target.value.replace(/\D/g, ""))} required /><span className="font-normal text-muted">Este procedimento exige pagamento de sinal para confirmação.</span></label>}<button className="primary-button mt-4 w-full sm:w-auto" disabled={loading || voucherPending || repeatBlocked || (repeats.length > 0 && !repeatConfirmed)} onClick={submit}>Confirmar agendamento</button></div>}
    {manageUrl && <a className="secondary-button w-fit" href={manageUrl}>Gerenciar agendamento</a>}
    {paymentUrl && <a className="primary-button w-fit" href={paymentUrl}>Pagar sinal para confirmar</a>}
    {message && <p className="rounded-xl bg-[#edf7f1] p-3 text-sm font-bold text-brand" role="status">{message}</p>}
  </div>;
}
