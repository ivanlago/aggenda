"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { BookingVoucher, type VoucherQuote } from "@/components/booking-voucher";

type Service = { id: string; name: string; durationMinutes: number; priceInCents: number | null; professionalIds: string[]; depositType: string };
type Professional = { id: string; name: string };

export function PortalBooking({ slug, services, professionals, timezone, horizonDays, hasUpcoming, initialVoucherCode = "" }: { slug: string; services: Service[]; professionals: Professional[]; timezone: string; horizonDays: number; hasUpcoming: boolean; initialVoucherCode?: string }) {
  const router = useRouter();
  const [serviceId, setServiceId] = useState("");
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
  const availabilityRequest = useRef<AbortController | null>(null);
  useEffect(() => () => availabilityRequest.current?.abort(), []);
  function resetAvailability() {
    availabilityRequest.current?.abort(); setLoading(false);
    setDate(""); setStartsAt(""); setTimes([]); setMessage("");
  }
  const selectedService = services.find((item) => item.id === serviceId);
  const eligible = useMemo(() => selectedService?.professionalIds.length ? professionals.filter((item) => selectedService.professionalIds.includes(item.id)) : professionals, [professionals, selectedService]);
  const minimumDate = new Date().toISOString().slice(0, 10);
  const maximum = new Date(); maximum.setDate(maximum.getDate() + horizonDays);

  async function loadDate(nextDate: string) {
    availabilityRequest.current?.abort(); setLoading(false);
    setDate(nextDate); setTimes([]); setStartsAt(""); setMessage("");
    if (!nextDate || !serviceId || !professionalId) return;
    availabilityRequest.current?.abort();
    const controller = new AbortController(); availabilityRequest.current = controller;
    setLoading(true);
    try {
      const response = await fetch(`/api/public/booking/${slug}/availability?date=${nextDate}&serviceId=${serviceId}&professionalId=${professionalId}`, { signal: controller.signal });
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
    setLoading(true); setMessage("");
    try {
      const response = await fetch(`/api/public/booking/${slug}/appointments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceId, professionalId, startsAt, document, voucherCode: voucherQuote?.code || "" }) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result) throw new Error(result?.error || "Não foi possível concluir o agendamento. Tente novamente.");
      setServiceId(""); setProfessionalId(""); setDate(""); setStartsAt(""); setTimes([]); setVoucherQuote(null);
      setPaymentUrl(result.paymentUrl || "");
      setMessage(result.paymentUrl ? "Horário reservado. Conclua o pagamento do sinal para confirmar." : "Agendamento realizado com sucesso."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível concluir o agendamento."); }
    finally { setLoading(false); }
  }

  return <div className="mt-5 grid gap-5">
    {hasUpcoming && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm"><strong>Você já possui agendamento futuro.</strong><p className="mt-1 text-amber-900">Confira-o abaixo antes de criar outro horário.</p></div>}
    <div className="grid gap-2"><p className="text-xs font-extrabold uppercase tracking-widest text-brand">Etapa 1</p><label className="font-extrabold">Qual procedimento você deseja?</label><select className="field" value={serviceId} onChange={(event) => { setServiceId(event.target.value); setProfessionalId(""); setVoucherQuote(null); setVoucherPending(false); resetAvailability(); }}><option value="">Selecione o procedimento</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.durationMinutes} min{item.priceInCents != null ? ` · ${(item.priceInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}</option>)}</select></div>
    {serviceId && <BookingVoucher key={serviceId} slug={slug} serviceId={serviceId} initialCode={initialVoucherCode} onChange={setVoucherQuote} onPendingChange={setVoucherPending} />}
    {serviceId && <div className="grid gap-2"><p className="text-xs font-extrabold uppercase tracking-widest text-brand">Etapa 2</p><label className="font-extrabold">Escolha um profissional habilitado</label><select className="field" value={professionalId} onChange={(event) => { setProfessionalId(event.target.value); resetAvailability(); }}><option value="">Selecione o profissional</option>{eligible.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{!eligible.length && <p className="text-sm text-red-700">Nenhum profissional está habilitado para este procedimento.</p>}</div>}
    {professionalId && <div className="grid gap-2"><p className="text-xs font-extrabold uppercase tracking-widest text-brand">Etapa 3</p><label className="font-extrabold">Escolha a data</label><input className="field min-h-12 text-base [color-scheme:light]" type="date" min={minimumDate} max={maximum.toISOString().slice(0, 10)} value={date} onChange={(event) => loadDate(event.target.value)} /></div>}
    {date && <div className="grid gap-2"><p className="text-xs font-extrabold uppercase tracking-widest text-brand">Etapa 4</p><label className="font-extrabold">Horários disponíveis em tempo real</label>{loading ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted">Consultando a agenda...</p> : <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{times.map((time) => <button type="button" key={time} onClick={() => setStartsAt(time)} className={`rounded-xl border px-3 py-3 text-sm font-extrabold transition ${startsAt === time ? "border-brand bg-brand text-white" : "bg-white hover:border-brand"}`}>{new Date(time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: timezone })}</button>)}</div>}</div>}
    {startsAt && <div className="rounded-2xl border bg-[#f8faf7] p-4"><p className="font-extrabold">Revise antes de confirmar</p><p className="mt-2 text-sm text-muted">{selectedService?.name} · {eligible.find((item) => item.id === professionalId)?.name} · {new Date(startsAt).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: timezone })}</p>{voucherQuote && <p className="mt-2 text-sm font-bold text-brand">Voucher {voucherQuote.code} · Total com desconto: {(voucherQuote.finalPriceInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>}{selectedService?.depositType !== "none" && <label className="mt-4 grid gap-2 text-sm font-bold">CPF ou CNPJ do responsável pelo pagamento<input className="field" inputMode="numeric" value={document} onChange={(event) => setDocument(event.target.value.replace(/\D/g, ""))} required /><span className="font-normal text-muted">Este procedimento exige pagamento de sinal para confirmação.</span></label>}<button className="primary-button mt-4 w-full sm:w-auto" disabled={loading || voucherPending} onClick={submit}>Confirmar agendamento</button></div>}
    {paymentUrl && <a className="primary-button w-fit" href={paymentUrl}>Pagar sinal para confirmar</a>}
    {message && <p className="rounded-xl bg-[#edf7f1] p-3 text-sm font-bold text-brand" role="status">{message}</p>}
  </div>;
}
