"use client";

import { useActionState, useState } from "react";

import { updateTeamMemberAccess, type TeamAccessActionState } from "@/actions/team";

const initialState: TeamAccessActionState = {};

const roleLabels = {
  admin: "Administrador",
  manager: "Gerente",
  receptionist: "Recepcionista",
  professional: "Profissional",
  financial: "Financeiro",
} as const;

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
      <select
        key={state.submissionId ?? "initial"}
        className="field py-2"
        name="role"
        value={role}
        onChange={(event) => setRole(event.target.value)}
      >
        {!['admin', 'manager', 'receptionist', 'professional', 'financial'].includes(initialRole) && (
          <option value={initialRole} disabled>Perfil legado — selecione um novo</option>
        )}
        <option value="admin">Administrador</option><option value="manager">Gerente</option>
        <option value="receptionist">Recepcionista</option><option value="professional">Profissional</option>
        <option value="financial">Financeiro</option>
      </select>
      {professionalRole && (
        <select
          className="field py-2"
          name="professionalId"
          defaultValue={initialProfessionalId}
          required
          aria-label="Profissional representado por esta conta"
        >
          <option value="" disabled>Selecione o profissional</option>
          {professionals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      )}
      <p className="text-xs text-muted sm:col-span-2">
        {professionalRole
          ? "Escolha qual profissional esta conta representa. Ela verá apenas a própria agenda."
          : "Defina o nível de acesso desta conta."}
      </p>
      {state.error && <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700 sm:col-span-2" role="alert">{state.error}</p>}
      {state.success && state.savedRole && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800 sm:col-span-2" role="status">
          Acesso salvo como {roleLabels[state.savedRole]}.
        </p>
      )}
      <button className="secondary-button py-2 sm:col-span-2" disabled={pending}>
        {pending ? "Salvando..." : "Salvar acesso"}
      </button>
    </form>
  );
}
