"use client";

import { useActionState, useState } from "react";

import { updateTeamMemberAccess, type TeamAccessActionState } from "@/actions/team";

const initialState: TeamAccessActionState = {};

export function TeamMemberAccessForm({
  userId, initialRole, initialProfessionalId, professionals,
}: {
  userId: string;
  initialRole: string;
  initialProfessionalId: string;
  professionals: Array<{ id: string; name: string }>;
}) {
  const [role, setRole] = useState(initialRole);
  const [state, formAction, pending] = useActionState(updateTeamMemberAccess, initialState);
  const professionalRole = role === "professional";

  return (
    <form action={formAction} className="grid gap-2 sm:grid-cols-2">
      <input type="hidden" name="userId" value={userId} />
      <select className="field py-2" name="role" value={role} onChange={(event) => setRole(event.target.value)}>
        <option value="admin">Administrador</option><option value="manager">Gerente</option>
        <option value="receptionist">Recepção</option><option value="professional">Profissional</option>
        <option value="staff">Funcionário</option><option value="viewer">Somente leitura</option>
      </select>
      <select
        className="field py-2"
        name="professionalId"
        defaultValue={initialProfessionalId}
        required={professionalRole}
        disabled={!professionalRole}
        aria-label="Profissional representado por esta conta"
      >
        <option value="" disabled={professionalRole}>
          {professionalRole ? "Selecione o profissional" : "Vínculo não necessário"}
        </option>
        {professionals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <p className="text-xs text-muted sm:col-span-2">
        {professionalRole
          ? "Escolha qual profissional esta conta representa. Ela verá apenas a própria agenda."
          : "Este perfil não precisa ser associado a um profissional."}
      </p>
      {state.error && <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700 sm:col-span-2" role="alert">{state.error}</p>}
      {state.success && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800 sm:col-span-2" role="status">Acesso salvo com sucesso.</p>}
      <button className="secondary-button py-2 sm:col-span-2" disabled={pending}>
        {pending ? "Salvando..." : "Salvar acesso"}
      </button>
    </form>
  );
}
