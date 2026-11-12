"use client";
import { FormActions } from "@/components/form-dialog-context";

import { useMemo, useState } from "react";

import { createUnifiedTeamMember } from "@/actions/team";
import { ActionForm } from "@/components/action-form";
import { PhoneInput } from "@/components/phone-input";
import { EntityImageField } from "@/components/entity-image-field";

type Profession = { id: string; name: string };
type Specialty = { id: string; name: string; professionId: string };

export function TeamCreateForm({ professions, specialties }: { professions: Profession[]; specialties: Specialty[] }) {
  const [role, setRole] = useState("receptionist");
  const [isAttendant, setIsAttendant] = useState("no");
  const [professionId, setProfessionId] = useState("");
  const availableSpecialties = useMemo(
    () => specialties.filter((item) => item.professionId === professionId),
    [professionId, specialties],
  );

  return (
    <ActionForm action={createUnifiedTeamMember} successMessage="Membro cadastrado e acesso enviado por e-mail." className="grid min-w-0 items-start gap-4 sm:grid-cols-2">
      <label className="grid gap-1 text-sm font-bold">Nome completo<input className="field" name="fullName" required /></label><label className="grid gap-1 text-sm font-bold">Nome curto<input className="field" name="shortName" required placeholder="Ex.: Dra. Marina Costa" /></label>
      <label className="grid gap-1 text-sm font-bold">E-mail<input className="field" name="email" type="email" required /></label><label className="grid gap-1 text-sm font-bold">Recebe agendamentos?
          <select className="field" name="isAttendant" required value={isAttendant} onChange={(event) => setIsAttendant(event.target.value)} disabled={role === "professional"}>
            <option value="no">Não</option><option value="yes">Sim</option>
          </select>
          {role === "professional" && <input type="hidden" name="isAttendant" value="yes" />}
          <span className="text-xs font-normal text-muted">O plano inclui 1 administrador e 1 secretária sem atendimento. O atendente e cada pessoa adicional usam uma vaga do plano.</span>
        </label>
      <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3"><label className="grid gap-1 text-sm font-bold">Perfil de acesso
          <select className="field" name="role" required value={role} onChange={(event) => {
            const nextRole = event.target.value;
            setRole(nextRole);
            if (nextRole === "professional") setIsAttendant("yes");
          }}>
            <option value="admin">Administrador</option>
            <option value="professional">Atendente</option><option value="receptionist">Secretária</option>

          </select>
        </label>{isAttendant === "yes" && <><label className="grid gap-1 text-sm font-bold">Ordem na agenda<input className="field" name="agendaOrder" type="number" min={0} max={9999} step={1} defaultValue={0} /></label><label className="grid gap-1 text-sm font-bold">Telefone<PhoneInput name="phone" /></label></>}</div>
      {isAttendant === "yes" && <>
        <div className="grid min-w-0 items-start gap-4 sm:col-span-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(140px,.7fr)]"><label className="grid gap-1 text-sm font-bold">Profissão
            <select className="field" name="professionId" value={professionId} onChange={(event) => setProfessionId(event.target.value)}>
              <option value="">Selecione</option>{professions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label><label className="grid gap-1 text-sm font-bold">Conselho<select className="field" name="council" defaultValue=""><option value="">Selecione</option>{["CRM", "CRO", "CRP", "COREN", "CREFITO", "OAB", "CREA", "CREF", "OUTRO"].map((item) => <option key={item}>{item}</option>)}</select></label><label className="grid gap-1 text-sm font-bold">Número do conselho<input className="field" name="registrationNumber" /></label><label className="grid gap-1 text-sm font-bold"><span className="whitespace-nowrap">UF do conselho</span><input className="field" name="registrationState" maxLength={2} /></label></div>
        <div className="grid min-w-0 items-start gap-4 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"><label className="grid gap-1 text-sm font-bold">Especialidade
            <select className="field h-24 min-h-24" name="specialtyIds" multiple disabled={!professionId}>
              {availableSpecialties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <span className="text-xs font-normal text-muted">Use Ctrl para selecionar mais de uma.</span>
          </label><label className="grid min-w-0 gap-1 text-sm font-bold">Apresentação breve (opcional)<textarea className="field h-24 min-h-24" name="bio" /></label></div>
        <div className="grid min-w-0 items-start gap-4 sm:col-span-2 sm:grid-cols-2"><div className="min-w-0"><EntityImageField label="Foto do profissional" /></div><div className="grid min-w-0 content-start gap-2"><p className="font-bold">Google Agenda</p><p className="text-sm text-muted">Após cadastrar o membro, abra a edição para conectar sua conta Google.</p></div></div>
      </>}
      <p className="text-xs text-muted sm:col-span-2">Após o cadastro, o Aggenda enviará um link de criação de senha válido por 24 horas.</p>
      <FormActions submitLabel="Cadastrar e enviar convite" />
    </ActionForm>
  );
}
