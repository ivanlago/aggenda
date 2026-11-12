"use client";
import { ModalShell } from "@/components/modal-shell";
import { FormActions } from "@/components/form-dialog-context";

import { CalendarCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { deleteUnifiedTeamMember, replaceTeamMemberAvailability, updateUnifiedTeamMember } from "@/actions/team";
import { ActionForm } from "@/components/action-form";
import { PhoneInput } from "@/components/phone-input";
import { EntityImageField, EntityThumbnail } from "@/components/entity-image-field";

type Profession = { id: string; name: string };
type Specialty = { id: string; name: string; professionId: string };
type Availability = { dayOfWeek: number; startsAt: string; endsAt: string };

const roleLabels: Record<string, string> = { owner: "Administrador", admin: "Administrador", manager: "Gerente", professional: "Atendente", receptionist: "Secretária", financial: "Financeiro" };
const days = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

export type TeamMemberCardData = {
  userId: string; fullName: string; shortName: string; email: string; role: string;
  professionalId: string | null; professionId: string | null; professionName: string | null;
  phone: string | null; bio: string | null; council: string | null; registrationNumber: string | null;
  registrationState: string | null; specialtyIds: string[]; availability: Availability[];
  imageUrl: string | null;
  agendaOrder: number | null;
  lastSignedIn: string | null;
  googleCalendarEmail?: string | null;
};

export function TeamMemberCard({ member, professions, specialties, canEdit, canDelete }: {
  member: TeamMemberCardData; professions: Profession[]; specialties: Specialty[]; canEdit: boolean; canDelete: boolean;
}) {
  const [professionId, setProfessionId] = useState(member.professionId ?? "");
  const availableSpecialties = useMemo(() => specialties.filter((item) => item.professionId === professionId), [professionId, specialties]);
  const availabilityByDay = new Map(member.availability.map((item) => [item.dayOfWeek, item]));

  return (
    <article className="team-member-row grid gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start gap-4">
        <EntityThumbnail src={member.imageUrl} alt={member.shortName} fallback={member.shortName[0]} />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-extrabold">{member.shortName}</p>
          <p className="truncate text-sm text-muted">{member.email}</p>
        </div>
      </div>
          <div className="flex flex-wrap gap-2">
            <span className="status-pill">{roleLabels[member.role] ?? member.role}</span>
            {member.professionName && <span className="status-pill">{member.professionName}</span>}
            {member.googleCalendarEmail && <span className="status-pill inline-flex items-center gap-1" title={member.googleCalendarEmail}><CalendarCheck className="size-4" aria-hidden="true" />Google conectado</span>}

          </div>
      {canEdit && <p className="text-xs text-muted"><span className="block font-bold">Última entrada</span>{member.lastSignedIn ?? "Sem registro"}</p>}
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
      {canEdit && (
        <ModalShell title={`Editar membro: ${member.shortName}`} triggerLabel="Editar membro" variant="edit" wide closeOnSuccess>
        <ActionForm action={updateUnifiedTeamMember} successMessage="Dados e acesso atualizados." className="grid min-w-0 items-start gap-4 sm:grid-cols-2">
          <input type="hidden" name="userId" value={member.userId} /><input type="hidden" name="professionalId" value={member.professionalId ?? ""} />
          <>
          <label className="grid gap-1 text-sm font-bold">Nome completo<input className="field" name="fullName" defaultValue={member.fullName} required /></label>
          <label className="grid gap-1 text-sm font-bold">Nome curto<input className="field" name="shortName" defaultValue={member.shortName} required /></label>
          </>
          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
          <>
          <label className="grid gap-1 text-sm font-bold">Perfil de acesso<select className="field" name="role" defaultValue={["owner", "admin", "professional", "receptionist"].includes(member.role) ? member.role : ""} required disabled={member.role === "owner"}>{!["owner", "admin", "professional", "receptionist"].includes(member.role) && <option value="" disabled>Selecione o novo perfil</option>}{member.role === "owner" && <option value="owner">Administrador</option>}<option value="admin">Administrador</option><option value="professional">Atendente</option><option value="receptionist">Secretária</option></select>{member.role === "owner" && <input type="hidden" name="role" value="owner" />}</label>
          </>
          {member.professionalId && <>
            <label className="grid gap-1 text-sm font-bold">Ordem na agenda<input className="field" name="agendaOrder" type="number" min={0} max={9999} step={1} defaultValue={member.agendaOrder ?? 0} /><span className="text-xs font-normal text-muted">Números menores aparecem primeiro. Empates seguem a ordem alfabética.</span></label>
          </>}
            {member.professionalId && <label className="grid gap-1 text-sm font-bold">Telefone<PhoneInput name="phone" defaultValue={member.phone} /></label>}
          </div>
          {member.professionalId && <>
            <div className="grid min-w-0 items-start gap-4 sm:col-span-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(140px,.7fr)]"><label className="grid gap-1 text-sm font-bold">Profissão<select className="field" name="professionId" value={professionId} onChange={(event) => setProfessionId(event.target.value)}><option value="">Selecione</option>{professions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="grid gap-1 text-sm font-bold">Conselho<select className="field" name="council" defaultValue={member.council ?? ""}><option value="">Selecione</option>{["CRM", "CRO", "CRP", "COREN", "CREFITO", "OAB", "CREA", "CREF", "OUTRO"].map((item) => <option key={item}>{item}</option>)}</select></label><label className="grid gap-1 text-sm font-bold">Número do conselho<input className="field" name="registrationNumber" defaultValue={member.registrationNumber ?? ""} /></label><label className="grid gap-1 text-sm font-bold"><span className="whitespace-nowrap">UF do conselho</span><input className="field" name="registrationState" maxLength={2} defaultValue={member.registrationState ?? ""} /></label></div>
            <div className="grid min-w-0 items-start gap-4 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"><label className="grid gap-1 text-sm font-bold">Especialidade<select className="field h-24 min-h-24" name="specialtyIds" multiple defaultValue={member.specialtyIds}>{availableSpecialties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="grid min-w-0 gap-1 text-sm font-bold">Apresentação breve (opcional)<textarea className="field h-24 min-h-24" name="bio" defaultValue={member.bio ?? ""} /></label></div>
            <div className="grid min-w-0 items-start gap-4 sm:col-span-2 sm:grid-cols-2"><div className="min-w-0"><EntityImageField currentUrl={member.imageUrl} label="Foto do profissional" /></div><div className="grid min-w-0 content-start gap-2">
              <p className="flex flex-wrap items-center gap-2 font-bold">Google Agenda{member.googleCalendarEmail && <span className="status-pill inline-flex items-center gap-1"><CalendarCheck className="size-4" aria-hidden="true" />Conectado</span>}</p>
              {member.googleCalendarEmail && <p className="break-words text-sm text-brand">{member.googleCalendarEmail}</p>}
              <p className="text-sm text-muted">Conecte a conta Google do atendente para sincronizar seus agendamentos.</p>
              <div><Link className="secondary-button" href={`/api/google-calendar/connect?professionalId=${encodeURIComponent(member.professionalId)}`} prefetch={false}>{member.googleCalendarEmail ? "Reconectar Google Agenda" : "Conectar Google Agenda"}</Link></div>
            </div></div>
          </>}
          <FormActions editing />
        </ActionForm></ModalShell>
      )}

      {canEdit && member.professionalId && (
        <ModalShell title={`Disponibilidade de ${member.shortName}`} triggerLabel={member.availability.length ? "Disponibilidade cadastrada" : "Cadastrar disponibilidade"} variant="edit" wide closeOnSuccess>
            <ActionForm action={replaceTeamMemberAvailability} successMessage="Disponibilidade atualizada." className="mt-5 grid gap-3">
              <input type="hidden" name="professionalId" value={member.professionalId} />
              {days.map((day, index) => { const current = availabilityByDay.get(index); return <div className="grid items-center gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_130px_130px]" key={day}><label className="flex items-center gap-2 font-bold"><input type="checkbox" name={`day-${index}`} defaultChecked={Boolean(current)} />{day}</label><input className="field py-2" type="time" name={`starts-${index}`} defaultValue={current?.startsAt ?? "09:00"} aria-label={`Início ${day}`} /><input className="field py-2" type="time" name={`ends-${index}`} defaultValue={current?.endsAt ?? "18:00"} aria-label={`Fim ${day}`} /></div>; })}
              <FormActions submitLabel="Salvar disponibilidade" />
            </ActionForm>
        </ModalShell>
      )}
        {canDelete && <ActionForm action={deleteUnifiedTeamMember} successMessage="Membro excluído."><input type="hidden" name="userId" value={member.userId} /><button className="icon-button" aria-label={`Excluir ${member.shortName}`}><Trash2 className="size-4" /></button></ActionForm>}
      </div>
    </article>
  );
}
