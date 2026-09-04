import { and, eq, isNull } from "drizzle-orm";
import { Copy, Trash2, UserPlus } from "lucide-react";

import {
  inviteTeamMember,
  removeTeamMember,
  resendTeamMemberAccess,
} from "@/actions/team";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { db } from "@/db";
import {
  organizationInvitations,
  organizationMembers,
  professionals,
  users,
} from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { hasOrganizationPermission } from "@/lib/permissions";
import { TeamMemberAccessForm } from "./team-member-access-form";

export const metadata = { title: "Equipe e acesso" };

export default async function TeamPage() {
  const { organization } = await requireOrganization();
  const [members, invitations, professionalItems] = await Promise.all([
    db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        role: organizationMembers.role,
        professionalId: professionals.id,
        professionalName: professionals.name,
        mustChangePassword: users.mustChangePassword,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .leftJoin(professionals, and(eq(professionals.organizationId, organizationMembers.organizationId), eq(professionals.userId, users.id)))
      .where(eq(organizationMembers.organizationId, organization.id)),
    db
      .select()
      .from(organizationInvitations)
      .where(
        and(
          eq(organizationInvitations.organizationId, organization.id),
          isNull(organizationInvitations.acceptedAt)
        )
      ),
    db.select({ id: professionals.id, name: professionals.name, userId: professionals.userId })
      .from(professionals)
      .where(and(eq(professionals.organizationId, organization.id), eq(professionals.isActive, true)))
      .orderBy(professionals.name),
  ]);
  const canManage = hasOrganizationPermission(organization.role, "team.manage");
  const canRead = hasOrganizationPermission(organization.role, "team.read");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!canRead) {
    return <div className="page-wrap"><p className="panel">Acesso restrito à gestão da equipe.</p></div>;
  }

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow={organization.name}
        title="Equipe e acesso"
        description="Convide cada pessoa para usar uma conta própria e controle suas permissões."
      />

      {canManage && (
        <section className="panel mb-5">
          <div className="flex items-center gap-3">
            <UserPlus className="size-5 text-brand" />
            <h2 className="text-xl font-extrabold">Criar acesso de usuário</h2>
          </div>
          <ActionForm action={inviteTeamMember} successMessage="Acesso criado e e-mail enviado." className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_180px_auto]">
            <input className="field" name="name" required placeholder="Nome completo" />
            <input className="field" name="email" type="email" required placeholder="pessoa@empresa.com" />
            <select className="field" name="role" defaultValue="viewer">
              <option value="admin">Administrador</option>
              <option value="manager">Gerente</option>
              <option value="receptionist">Recepção</option>
              <option value="staff">Funcionário</option>
              <option value="viewer">Somente leitura</option>
            </select>
            <button className="primary-button">Criar acesso</button>
          </ActionForm>
          <p className="mt-3 text-xs text-muted">
            O Aggenda cria o usuário e envia um link de definição de senha válido por 24 horas. Profissionais recebem acesso ao serem cadastrados na página Profissionais.
          </p>
        </section>
      )}

      <section className="panel">
        <h2 className="text-xl font-extrabold">Pessoas com acesso</h2>
        <div className="mt-5 divide-y">
          {members.map((member) => (
            <div key={member.userId} className="flex items-center gap-4 py-4">
              <div className="min-w-0 flex-1">
                {member.role === "professional" && member.professionalName ? (
                  <p className="font-bold">{member.professionalName}</p>
                ) : member.role !== "professional" ? (
                  <p className="font-bold">{member.name}</p>
                ) : null}
                <p className="truncate text-sm text-muted">{member.email}</p>
                {member.mustChangePassword && (
                  <div className="mt-2">
                    <span className="text-xs font-bold text-amber-700">Aguardando criação da senha</span>
                    {canManage && (
                      <ActionForm action={resendTeamMemberAccess} successMessage="Novo link enviado.">
                        <input type="hidden" name="userId" value={member.userId} />
                        <button className="mt-2 text-xs font-extrabold text-brand underline">Reenviar acesso por e-mail</button>
                      </ActionForm>
                    )}
                  </div>
                )}
              </div>
              {member.role === "professional" && member.professionalId ? (
                <div className="text-right">
                  <span className="status-pill">Profissional</span>
                  <p className="mt-2 text-xs text-muted">Vínculo automático concluído</p>
                </div>
              ) : canManage && member.role !== "owner" ? (
                <TeamMemberAccessForm
                  userId={member.userId}
                  initialRole={member.role}
                  initialProfessionalId={member.professionalId ?? ""}
                  professionals={professionalItems
                    .filter((item) => !item.userId || item.userId === member.userId)
                    .map(({ id, name }) => ({ id, name }))}
                />
              ) : <span className="status-pill">{member.role}</span>}
              {organization.role === "owner" && member.role !== "owner" && (
                <form action={removeTeamMember}>
                  <input type="hidden" name="userId" value={member.userId} />
                  <button className="icon-button" aria-label={`Remover ${member.name}`}>
                    <Trash2 className="size-4" />
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      </section>

      {canManage && invitations.length > 0 && (
        <section className="panel mt-5">
          <h2 className="text-xl font-extrabold">Convites pendentes</h2>
          <div className="mt-5 grid gap-3">
            {invitations.map((invitation) => {
              const url = `${appUrl}/convite/${invitation.token}`;
              return (
                <div key={invitation.id} className="rounded-2xl border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold">{invitation.email}</p>
                      <p className="text-xs text-muted">
                        {invitation.role} · expira em {invitation.expiresAt.toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <Copy className="size-4 text-brand" />
                  </div>
                  <input className="field mt-3 text-xs" readOnly value={url} aria-label="Link do convite" />
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
