"use server";

import { and, eq, ilike, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import {
  organizationInvitations,
  organizationMembers,
  professionals,
  users,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  requireOrganization,
  requireOrganizationMembership,
  requireSession,
} from "@/lib/session";
import { assertOrganizationPermission } from "@/lib/permissions";

export async function inviteTeamMember(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "team.manage");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const requestedRole = String(formData.get("role") ?? "viewer");
  const allowedRoles = [
    "admin",
    "manager",
    "receptionist",
    "staff",
    "viewer",
  ] as const;
  const role = allowedRoles.includes(requestedRole as (typeof allowedRoles)[number])
    ? (requestedRole as (typeof allowedRoles)[number])
    : "viewer";
  if (name.length < 2) throw new Error("Informe o nome da pessoa.");
  if (!email.includes("@")) throw new Error("Informe um e-mail válido.");

  const [existingUser] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existingUser) {
    const [membership] = await db
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(and(
        eq(organizationMembers.organizationId, organization.id),
        eq(organizationMembers.userId, existingUser.id),
      ))
      .limit(1);
    if (membership) throw new Error("Este e-mail já possui acesso à empresa.");
  }

  const provisionedUser = existingUser ?? (await auth.api.signUpEmail({
    body: {
      name,
      email,
      password: `${crypto.randomUUID()}-${crypto.randomUUID()}`,
    },
  })).user;

  await db.transaction(async (tx) => {
    await tx.insert(organizationMembers).values({
      organizationId: organization.id,
      userId: provisionedUser.id,
      role,
    });
    await tx.delete(organizationInvitations).where(and(
      eq(organizationInvitations.organizationId, organization.id),
      eq(organizationInvitations.email, email),
    ));
    await tx
      .update(users)
      .set({ mustChangePassword: true, updatedAt: new Date() })
      .where(eq(users.id, provisionedUser.id));
  });

  await auth.api.requestPasswordReset({
    body: {
      email,
      redirectTo: `/redefinir-senha?primeiroAcesso=1&email=${encodeURIComponent(email)}`,
    },
  });

  revalidatePath("/equipe");
}

export async function resendTeamMemberAccess(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "team.manage");
  const userId = String(formData.get("userId") ?? "");
  const [member] = await db
    .select({ email: users.email, mustChangePassword: users.mustChangePassword })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(and(
      eq(organizationMembers.organizationId, organization.id),
      eq(organizationMembers.userId, userId),
    ))
    .limit(1);
  if (!member) return { error: "Usuário não encontrado nesta empresa." };
  if (!member.mustChangePassword) return { warning: "Este usuário já concluiu a criação da senha." };

  try {
    await auth.api.requestPasswordReset({
      body: {
        email: member.email,
        redirectTo: `/redefinir-senha?primeiroAcesso=1&email=${encodeURIComponent(member.email)}`,
      },
    });
    return { warning: "Novo link enviado. Ele será válido por 24 horas." };
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      message: "Falha ao reenviar acesso de usuário",
      organizationId: organization.id,
      userId,
      error: error instanceof Error ? error.message : String(error),
    }));
    return { error: "Não foi possível reenviar o e-mail agora. Tente novamente em alguns minutos." };
  }
}

export async function acceptInvitation(token: string) {
  const session = await requireSession();
  const [invitation] = await db
    .select()
    .from(organizationInvitations)
    .where(eq(organizationInvitations.token, token))
    .limit(1);

  if (
    !invitation ||
    invitation.acceptedAt ||
    invitation.expiresAt <= new Date() ||
    invitation.email !== session.user.email.toLowerCase()
  ) {
    throw new Error("Este convite não é válido para a conta conectada.");
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(organizationMembers)
      .values({
        organizationId: invitation.organizationId,
        userId: session.user.id,
        role: invitation.role,
      })
      .onConflictDoUpdate({
        target: [
          organizationMembers.organizationId,
          organizationMembers.userId,
        ],
        set: { role: invitation.role },
      });
    if (invitation.role === "professional") {
      const [matchingProfessional] = await tx
        .select({ id: professionals.id })
        .from(professionals)
        .where(
          and(
            eq(professionals.organizationId, invitation.organizationId),
            eq(professionals.isActive, true),
            invitation.professionalId
              ? eq(professionals.id, invitation.professionalId)
              : ilike(professionals.email, invitation.email),
            or(isNull(professionals.userId), eq(professionals.userId, session.user.id))
          )
        )
        .limit(1);
      if (matchingProfessional) {
        await tx
          .update(professionals)
          .set({ userId: session.user.id, updatedAt: new Date() })
          .where(eq(professionals.id, matchingProfessional.id));
      }
    }
    await tx
      .update(organizationInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(organizationInvitations.id, invitation.id));
  });

  redirect("/dashboard");
}

export async function removeTeamMember(formData: FormData) {
  const { session, organization } = await requireOrganizationMembership();
  if (organization.role !== "owner") {
    throw new Error("Somente o proprietário pode remover membros.");
  }

  const userId = String(formData.get("userId") ?? "");
  if (userId === session.user.id) {
    throw new Error("O proprietário não pode remover a própria conta.");
  }

  await db
    .delete(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organization.id),
        eq(organizationMembers.userId, userId)
      )
    );
  revalidatePath("/equipe");
}

export type TeamAccessActionState = { error?: string; success?: boolean };

export async function updateTeamMemberAccess(
  _previousState: TeamAccessActionState,
  formData: FormData
): Promise<TeamAccessActionState> {
  try {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "team.manage");
  const userId = String(formData.get("userId") ?? "");
  const requestedRole = String(formData.get("role") ?? "viewer");
  const professionalId = String(formData.get("professionalId") ?? "");
  const allowedRoles = ["admin", "manager", "receptionist", "professional", "staff", "viewer"] as const;
  const role = allowedRoles.includes(requestedRole as (typeof allowedRoles)[number])
    ? requestedRole as (typeof allowedRoles)[number]
    : "viewer";
  const [member] = await db.select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organization.id), eq(organizationMembers.userId, userId)))
    .limit(1);
  if (!member) return { error: "Membro não encontrado nesta empresa." };
  if (role === "professional" && !professionalId) {
    return { error: "Selecione qual profissional esta conta representa." };
  }

  await db.transaction(async (tx) => {
    await tx.update(organizationMembers).set({ role }).where(and(
      eq(organizationMembers.organizationId, organization.id),
      eq(organizationMembers.userId, userId),
    ));
    await tx.update(professionals).set({ userId: null, updatedAt: new Date() }).where(and(
      eq(professionals.organizationId, organization.id),
      eq(professionals.userId, userId),
    ));
    if (role === "professional") {
      const updated = await tx.update(professionals).set({ userId, updatedAt: new Date() }).where(and(
        eq(professionals.id, professionalId),
        eq(professionals.organizationId, organization.id),
        eq(professionals.isActive, true),
      )).returning({ id: professionals.id });
      if (!updated.length) throw new Error("Profissional inválido para esta empresa.");
    }
  });
  revalidatePath("/equipe");
  return { success: true };
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      message: "Falha ao atualizar acesso da equipe",
      error: error instanceof Error ? error.message : String(error),
    }));
    return { error: "Não foi possível salvar o acesso. Atualize a página e tente novamente." };
  }
}
