import { and, eq, isNull } from "drizzle-orm";
import { Copy, Trash2, UserPlus } from "lucide-react";

import {
  inviteTeamMember,
  removeTeamMember,
} from "@/actions/team";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import {
  organizationInvitations,
  organizationMembers,
  users,
} from "@/db/schema";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Equipe e acesso" };

export default async function TeamPage() {
  const { organization } = await requireOrganization();
  const [members, invitations] = await Promise.all([
    db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
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
  ]);
  const canManage = ["owner", "admin"].includes(organization.role);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

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
            <h2 className="text-xl font-extrabold">Convidar pessoa</h2>
          </div>
          <form action={inviteTeamMember} className="mt-5 grid gap-3 md:grid-cols-[1fr_180px_auto]">
            <input className="field" name="email" type="email" required placeholder="pessoa@empresa.com" />
            <select className="field" name="role" defaultValue="member">
              <option value="member">Membro</option>
              <option value="admin">Administrador</option>
            </select>
            <button className="primary-button">Gerar convite</button>
          </form>
          <p className="mt-3 text-xs text-muted">
            O convite vale por 7 dias. Copie o link abaixo e envie ao destinatário.
          </p>
        </section>
      )}

      <section className="panel">
        <h2 className="text-xl font-extrabold">Pessoas com acesso</h2>
        <div className="mt-5 divide-y">
          {members.map((member) => (
            <div key={member.userId} className="flex items-center gap-4 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-bold">{member.name}</p>
                <p className="truncate text-sm text-muted">{member.email}</p>
              </div>
              <span className="status-pill">{member.role}</span>
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
