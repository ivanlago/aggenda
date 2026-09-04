"use client";

import { CalendarClock, Pencil, Save, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { deleteUnifiedTeamMember, replaceTeamMemberAvailability, updateUnifiedTeamMember } from "@/actions/team";
import { ActionForm } from "@/components/action-form";

type Profession = { id: string; name: string };
type Specialty = { id: string; name: string; professionId: string };
type Availability = { dayOfWeek: number; startsAt: string; endsAt: string };

const roleLabels: Record<string, string> = { owner: "Administrador", admin: "Administrador", manager: "Gerente", professional: "Profissional", receptionist: "Recepcionista", financial: "Financeiro" };
const days = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

export type TeamMemberCardData = {
  userId: string; fullName: string; shortName: string; email: string; role: string;
  professionalId: string | null; professionId: string | null; professionName: string | null;
  phone: string | null; bio: string | null; council: string | null; registrationNumber: string | null;
  registrationState: string | null; specialtyIds: string[]; availability: Availability[];
};

export function TeamMemberCard({ member, professions, specialties, canEdit, canDelete }: {
  member: TeamMemberCardData; professions: Profession[]; specialties: Specialty[]; canEdit: boolean; canDelete: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [professionId, setProfessionId] = useState(member.professionId ?? "");
  const availableSpecialties = useMemo(() => specialties.filter((item) => item.professionId === professionId), [professionId, specialties]);
  const availabilityByDay = new Map(member.availability.map((item) => [item.dayOfWeek, item]));

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-extrabold">{member.shortName}</p>
          <p className="truncate text-sm text-muted">{member.email}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="status-pill">{roleLabels[member.role] ?? member.role}</span>
            {member.professionName && <span className="status-pill">{member.professionName}</span>}
            {member.professionalId && (
              <button type="button" onClick={() => setAvailabilityOpen(true)} className={`rounded-full px-3 py-1 text-xs font-extrabold ${member.availability.length ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
                <CalendarClock className="mr-1 inline size-3" />{member.availability.length ? "Disponibilidade cadastrada" : "Cadastrar disponibilidade"}
              </button>
            )}
          </div>
        </div>
        {canEdit && <button className="icon-button" type="button" onClick={() => setEditing((value) => !value)} aria-label="Editar membro"><Pencil className="size-4" /></button>}
        {canDelete && <ActionForm action={deleteUnifiedTeamMember} successMessage="Membro excluído."><input type="hidden" name="userId" value={member.userId} /><button className="icon-button" aria-label="Excluir membro"><Trash2 className="size-4" /></button></ActionForm>}
      </div>

      {editing && (
        <ActionForm action={updateUnifiedTeamMember} successMessage="Dados e acesso atualizados." className="mt-4 grid items-start gap-3 rounded-2xl bg-[#f7faf7] p-4 md:grid-cols-2" onSuccess={() => setEditing(false)}>
          <input type="hidden" name="userId" value={member.userId} /><input type="hidden" name="professionalId" value={member.professionalId ?? ""} />
          <label className="grid gap-1 text-sm font-bold">Nome completo<input className="field" name="fullName" defaultValue={member.fullName} required /></label>
          <label className="grid gap-1 text-sm font-bold">Nome curto<input className="field" name="shortName" defaultValue={member.shortName} required /></label>
          <label className="grid gap-1 text-sm font-bold">Perfil de acesso<select className="field" name="role" defaultValue={member.role} disabled={member.role === "owner"}>{member.role === "owner" && <option value="owner">Administrador</option>}<option value="admin">Administrador</option><option value="manager">Gerente</option><option value="professional">Profissional</option><option value="receptionist">Recepcionista</option><option value="financial">Financeiro</option></select>{member.role === "owner" && <input type="hidden" name="role" value="owner" />}</label>
          {member.professionalId && <>
            <label className="grid gap-1 text-sm font-bold">Profissão<select className="field" name="professionId" value={professionId} onChange={(event) => setProfessionId(event.target.value)}><option value="">Selecione</option>{professions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-bold">Especialidades<select className="field min-h-24" name="specialtyIds" multiple defaultValue={member.specialtyIds}>{availableSpecialties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-bold">Conselho<select className="field" name="council" defaultValue={member.council ?? ""}><option value="">Selecione</option>{["CRM", "CRO", "CRP", "COREN", "CREFITO", "OAB", "CREA", "CREF", "OUTRO"].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-bold">Número do conselho<input className="field" name="registrationNumber" defaultValue={member.registrationNumber ?? ""} /></label>
            <label className="grid gap-1 text-sm font-bold">UF do conselho<input className="field" name="registrationState" maxLength={2} defaultValue={member.registrationState ?? ""} /></label>
            <label className="grid gap-1 text-sm font-bold">Telefone<input className="field" name="phone" defaultValue={member.phone ?? ""} /></label>
            <label className="grid gap-1 text-sm font-bold md:col-span-2">Apresentação breve<textarea className="field min-h-20" name="bio" defaultValue={member.bio ?? ""} /></label>
          </>}
          <button className="primary-button md:col-span-2"><Save className="mr-2 inline size-4" />Salvar</button>
        </ActionForm>
      )}

      {availabilityOpen && member.professionalId && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label={`Disponibilidade de ${member.shortName}`}>
          <div className="my-6 w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between"><div><p className="eyebrow">Disponibilidade semanal</p><h2 className="text-xl font-extrabold">{member.shortName}</h2></div><button className="icon-button" type="button" onClick={() => setAvailabilityOpen(false)}><X className="size-5" /></button></div>
            <ActionForm action={replaceTeamMemberAvailability} successMessage="Disponibilidade atualizada." className="mt-5 grid gap-3" onSuccess={() => setAvailabilityOpen(false)}>
              <input type="hidden" name="professionalId" value={member.professionalId} />
              {days.map((day, index) => { const current = availabilityByDay.get(index); return <div className="grid items-center gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_130px_130px]" key={day}><label className="flex items-center gap-2 font-bold"><input type="checkbox" name={`day-${index}`} defaultChecked={Boolean(current)} />{day}</label><input className="field py-2" type="time" name={`starts-${index}`} defaultValue={current?.startsAt ?? "09:00"} aria-label={`Início ${day}`} /><input className="field py-2" type="time" name={`ends-${index}`} defaultValue={current?.endsAt ?? "18:00"} aria-label={`Fim ${day}`} /></div>; })}
              <button className="primary-button">Salvar disponibilidade</button>
            </ActionForm>
          </div>
        </div>
      )}
    </article>
  );
}
