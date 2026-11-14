"use client";

import { useRef, useState } from "react";
import { saveAppointmentEdit } from "@/actions/appointment-edit";
import { ActionForm } from "@/components/action-form";
import { organizationDate } from "@/lib/organization-time";

type Status = "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";
export function AppointmentEditForm({ appointmentId, serviceId, professionalId, professionalName, startsAt, status: initialStatus, cancellationReason, roomId: initialRoomId, timezone, canTransfer, professionals, rooms }: {
 appointmentId: string; serviceId: string; professionalId: string | null; professionalName: string | null; startsAt: string; status: Status; cancellationReason: string | null; roomId: string | null; timezone: string; canTransfer: boolean;
 professionals: { id: string; name: string }[]; rooms: { id: string; name: string; isActive: boolean }[];
}) {
 const [status, setStatus] = useState(initialStatus);
 const [professional, setProfessional] = useState(professionalId ?? "");
 const [room, setRoom] = useState(initialRoomId ?? "");
 const [date, setDate] = useState(organizationDate(new Date(startsAt), timezone));
 const [time, setTime] = useState(startsAt);
 const [times, setTimes] = useState([startsAt]);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState("");
 const controller = useRef<AbortController | null>(null);
 const choices = professionalId && !professionals.some(person => person.id === professionalId) ? [{ id: professionalId, name: professionalName ?? "Profissional atual" }, ...professionals] : professionals;
 const active = ["scheduled", "confirmed"].includes(initialStatus) && ["scheduled", "confirmed"].includes(status);
 async function availability(nextDate: string, nextRoom: string, nextProfessional: string) {
  controller.current?.abort();setTime("");setTimes([]);setError("");setLoading(false);
  if (!nextProfessional) { setTime(startsAt); setTimes([startsAt]); return; }
  if (!nextDate) return;
  const request = new AbortController();controller.current = request;setLoading(true);
  try {
   const query = new URLSearchParams({ date: nextDate, serviceId, professionalId: nextProfessional, roomId: nextRoom, excludeAppointmentId: appointmentId });
   const response = await fetch(`/api/availability?${query}`, { signal: request.signal });
   const result = await response.json();
   if (!response.ok) throw new Error(result.error || "Não foi possível consultar os horários.");
   if (request.signal.aborted) return;
   const options: string[] = result.availableTimes ?? [];setTimes(options);
   if (options.includes(startsAt)) setTime(startsAt);
  } catch (failure) { if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : "Falha ao consultar horários."); }
  finally { if (!request.signal.aborted) setLoading(false); }
 }
 return <ActionForm action={saveAppointmentEdit} successMessage="Agendamento salvo." resetOnSuccess={false} className="grid gap-4">
  <input type="hidden" name="id" value={appointmentId} />
  <input type="hidden" name="startsAt" value={time} />
  <div className="grid gap-3 sm:grid-cols-2">
   <label className="grid gap-1 text-sm font-bold">Situação<select className="field" name="status" value={status} onChange={event => setStatus(event.target.value as Status)}>{([["scheduled","Agendado"],["confirmed","Confirmado"],["completed","Concluído"],["cancelled","Cancelado"],["no_show","Não compareceu"]] as const).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <label className="grid gap-1 text-sm font-bold">Profissional<select className="field" value={professional} disabled={!canTransfer || !active} onChange={event=>{setProfessional(event.target.value);void availability(date,room,event.target.value)}}><option value="">Sem profissional</option>{choices.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
   <input type="hidden" name="professionalId" value={professional} />
  </div>
  <div className="grid gap-3 sm:grid-cols-3">
   <label className="grid gap-1 text-sm font-bold">Sala<select className="field" value={room} disabled={!active} onChange={event=>{setRoom(event.target.value);void availability(date,event.target.value,professional)}}><option value="">Selecionar automaticamente</option>{rooms.filter(item=>item.isActive||item.id===initialRoomId).map(item=><option key={item.id} value={item.id}>{item.name}{!item.isActive?" (inativa)":""}</option>)}</select></label>
   <input type="hidden" name="roomId" value={room} />
   <label className="grid gap-1 text-sm font-bold">Data<input className="field" type="date" value={date} disabled={!active || !professional} required onChange={event=>{setDate(event.target.value);void availability(event.target.value,room,professional)}} /></label>
   <label className="grid gap-1 text-sm font-bold">Horário<select className="field" value={time} disabled={!active || loading || !professional} required onChange={event=>setTime(event.target.value)}><option value="">{loading?"Consultando…":times.length?"Selecione":"Nenhum horário disponível"}</option>{times.map(value=><option key={value} value={value}>{new Date(value).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",timeZone:timezone})}</option>)}</select></label>
  </div>
  {status === "cancelled" && <label className="grid gap-1 text-sm font-bold">Motivo do cancelamento *<input className="field" name="cancellationReason" defaultValue={cancellationReason??""} required maxLength={2000} /></label>}
  {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
  <p className="text-xs leading-5 text-slate-500">As alterações serão salvas juntas. Mudanças de profissional, data e sala estão sujeitas à disponibilidade.</p>
  <div className="flex justify-end border-t pt-3"><button className="primary-button" disabled={loading || !time}>Salvar</button></div>
 </ActionForm>;
}
