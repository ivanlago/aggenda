"use client";

import { useMemo, useState } from "react";

import { createUnifiedTeamMember } from "@/actions/team";
import { ActionForm } from "@/components/action-form";

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
    <ActionForm action={createUnifiedTeamMember} successMessage="Membro cadastrado e acesso enviado por e-mail." className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold">Nome completo<input className="field" name="fullName" required /></label>
        <label className="grid gap-2 text-sm font-bold">Nome curto<input className="field" name="shortName" required placeholder="Ex.: Dra. Marina Costa" /></label>
        <label className="grid gap-2 text-sm font-bold">E-mail<input className="field" name="email" type="email" required /></label>
        <label className="grid gap-2 text-sm font-bold">Perfil de acesso
          <select className="field" name="role" required value={role} onChange={(event) => {
            const nextRole = event.target.value;
            setRole(nextRole);
            if (nextRole === "professional") setIsAttendant("yes");
          }}>
            <option value="admin">Administrador</option><option value="manager">Gerente</option>
            <option value="professional">Profissional</option><option value="receptionist">Recepcionista</option>
            <option value="financial">Financeiro</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold">Atendente?
          <select className="field" name="isAttendant" required value={isAttendant} onChange={(event) => setIsAttendant(event.target.value)} disabled={role === "professional"}>
            <option value="no">Não</option><option value="yes">Sim</option>
          </select>
          {role === "professional" && <input type="hidden" name="isAttendant" value="yes" />}
        </label>
      </div>

      {isAttendant === "yes" && (
        <div className="grid gap-4 rounded-2xl border border-brand/15 bg-[#f7faf7] p-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold">Profissão
            <select className="field" name="professionId" value={professionId} onChange={(event) => setProfessionId(event.target.value)}>
              <option value="">Selecione</option>{professions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold">Especialidades
            <select className="field min-h-28" name="specialtyIds" multiple disabled={!professionId}>
              {availableSpecialties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <span className="text-xs font-normal text-muted">Use Ctrl para selecionar mais de uma.</span>
          </label>
          <label className="grid gap-2 text-sm font-bold">Conselho<select className="field" name="council" defaultValue=""><option value="">Selecione</option>{["CRM", "CRO", "CRP", "COREN", "CREFITO", "OAB", "CREA", "CREF", "OUTRO"].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="grid gap-2 text-sm font-bold">Número do conselho<input className="field" name="registrationNumber" /></label>
          <label className="grid gap-2 text-sm font-bold">UF do conselho<input className="field" name="registrationState" maxLength={2} /></label>
          <label className="grid gap-2 text-sm font-bold">Telefone<input className="field" name="phone" type="tel" /></label>
          <label className="grid gap-2 text-sm font-bold md:col-span-2">Apresentação breve<textarea className="field min-h-24" name="bio" /></label>
        </div>
      )}
      <p className="text-xs text-muted">Após o cadastro, o Aggenda enviará um link de criação de senha válido por 24 horas.</p>
      <button className="primary-button w-fit">Cadastrar membro da equipe</button>
    </ActionForm>
  );
}
