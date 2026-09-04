"use server";

import { and, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import {
  organizationInvitations,
  organizationMembers,
  professionalRegistrations,
  professionalSpecialties,
  professionals,
  specialties,
  users,
  weeklyAvailability,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  requireOrganization,
  requireOrganizationMembership,
  requireSession,
} from "@/lib/session";
import { assertOrganizationPermission } from "@/lib/permissions";

const teamRoles = ["admin", "manager", "receptionist", "professional", "financial"] as const;
type TeamRole = (typeof teamRoles)[number];

function field(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function parsedTeamRole(formData: FormData): TeamRole {
  const requested = field(formData, "role");
  return teamRoles.includes(requested as TeamRole) ? requested as TeamRole : "receptionist";
}

async function validatedSpecialtyIds(formData: FormData, professionId: string) {
  const specialtyIds = [...new Set(formData.getAll("specialtyIds").map(String).filter(Boolean))];
  if (!specialtyIds.length) return specialtyIds;
  if (!professionId) throw new Error("Selecione a profissão correspondente às especialidades.");
  const valid = await db.select({ id: specialties.id }).from(specialties).where(and(
    inArray(specialties.id, specialtyIds),
    eq(specialties.professionId, professionId),
    eq(specialties.isActive, true),
  ));
  if (valid.length !== specialtyIds.length) throw new Error("Uma ou mais especialidades não pertencem à profissão.");
  return specialtyIds;
}

export async function createUnifiedTeamMember(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "team.manage");
  const fullName = field(formData, "fullName");
  const shortName = field(formData, "shortName");
  const email = field(formData, "email").toLowerCase();
  const role = parsedTeamRole(formData);
  const isAttendant = field(formData, "isAttendant") === "yes";
  const professionId = field(formData, "professionId");
  const council = field(formData, "council").toUpperCase();
  const registrationNumber = field(formData, "registrationNumber");
  const specialtyIds = isAttendant ? await validatedSpecialtyIds(formData, professionId) : [];

  if (fullName.length < 2 || shortName.length < 2 || !email.includes("@")) {
    throw new Error("Preencha nome completo, nome curto e um e-mail válido.");
  }
  if (!isAttendant && role === "professional") {
    throw new Error("O perfil Profissional precisa estar marcado como atendente.");
  }
  if ((council && !registrationNumber) || (!council && registrationNumber)) {
    throw new Error("Informe o conselho e o número do conselho.");
  }
  const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existingUser) {
    const [membership] = await db.select({ userId: organizationMembers.userId }).from(organizationMembers).where(and(
      eq(organizationMembers.organizationId, organization.id), eq(organizationMembers.userId, existingUser.id),
    )).limit(1);
    if (membership) throw new Error("Este e-mail já pertence a um membro desta equipe.");
  }

  const provisionedUser = existingUser ?? (await auth.api.signUpEmail({
    body: { name: fullName, email, password: `${crypto.randomUUID()}-${crypto.randomUUID()}` },
  })).user;

  await db.transaction(async (tx) => {
    await tx.update(users).set({
      name: fullName,
      shortName,
      mustChangePassword: true,
      updatedAt: new Date(),
    }).where(eq(users.id, provisionedUser.id));
    await tx.insert(organizationMembers).values({ organizationId: organization.id, userId: provisionedUser.id, role });
    if (!isAttendant) return;
    const [professional] = await tx.insert(professionals).values({
      organizationId: organization.id,
      userId: provisionedUser.id,
      name: shortName,
      email,
      phone: field(formData, "phone") || null,
      professionId: professionId || null,
      bio: field(formData, "bio") || null,
      isBookable: true,
    }).returning({ id: professionals.id });
    if (specialtyIds.length) await tx.insert(professionalSpecialties).values(specialtyIds.map((specialtyId) => ({
      organizationId: organization.id, professionalId: professional.id, specialtyId,
    })));
    if (council && registrationNumber) await tx.insert(professionalRegistrations).values({
      organizationId: organization.id,
      professionalId: professional.id,
      council,
      registrationNumber,
      state: field(formData, "registrationState").toUpperCase() || null,
    });
  });

  await auth.api.requestPasswordReset({
    body: { email, redirectTo: `/redefinir-senha?primeiroAcesso=1&email=${encodeURIComponent(email)}` },
  });
  revalidatePath("/equipe");
}

export async function updateUnifiedTeamMember(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "team.manage");
  const userId = field(formData, "userId");
  const fullName = field(formData, "fullName");
  const shortName = field(formData, "shortName");
  const requestedRole = parsedTeamRole(formData);
  const professionalId = field(formData, "professionalId");
  const professionId = field(formData, "professionId");
  const specialtyIds = professionalId ? await validatedSpecialtyIds(formData, professionId) : [];
  if (!userId || fullName.length < 2 || shortName.length < 2) throw new Error("Informe os nomes completo e curto.");
  const [currentMember] = await db.select({ role: organizationMembers.role }).from(organizationMembers).where(and(
    eq(organizationMembers.organizationId, organization.id), eq(organizationMembers.userId, userId),
  )).limit(1);
  if (!currentMember) throw new Error("Membro não encontrado nesta empresa.");
  const role = currentMember.role === "owner" ? "owner" : requestedRole;
  if (role === "professional" && !professionalId) throw new Error("O perfil Profissional precisa ser atendente.");
  await db.transaction(async (tx) => {
    await tx.update(users).set({ name: fullName, shortName, updatedAt: new Date() }).where(eq(users.id, userId));
    await tx.update(organizationMembers).set({ role }).where(and(eq(organizationMembers.organizationId, organization.id), eq(organizationMembers.userId, userId)));
    if (!professionalId) return;
    await tx.update(professionals).set({
      name: shortName,
      phone: field(formData, "phone") || null,
      professionId: professionId || null,
      bio: field(formData, "bio") || null,
      updatedAt: new Date(),
    }).where(and(eq(professionals.id, professionalId), eq(professionals.organizationId, organization.id)));
    await tx.delete(professionalSpecialties).where(and(eq(professionalSpecialties.professionalId, professionalId), eq(professionalSpecialties.organizationId, organization.id)));
    if (specialtyIds.length) await tx.insert(professionalSpecialties).values(specialtyIds.map((specialtyId) => ({ organizationId: organization.id, professionalId, specialtyId })));
    const council = field(formData, "council").toUpperCase();
    const registrationNumber = field(formData, "registrationNumber");
    await tx.delete(professionalRegistrations).where(and(eq(professionalRegistrations.professionalId, professionalId), eq(professionalRegistrations.organizationId, organization.id)));
    if (council && registrationNumber) await tx.insert(professionalRegistrations).values({
      organizationId: organization.id, professionalId, council, registrationNumber,
      state: field(formData, "registrationState").toUpperCase() || null,
    });
  });
  revalidatePath("/equipe");
}

export async function replaceTeamMemberAvailability(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "availability.manage");
  const professionalId = field(formData, "professionalId");
  const rows = Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    enabled: field(formData, `day-${dayOfWeek}`) === "on",
    startsAt: field(formData, `starts-${dayOfWeek}`),
    endsAt: field(formData, `ends-${dayOfWeek}`),
  })).filter((row) => row.enabled);
  if (!professionalId) throw new Error("Profissional não informado.");
  if (rows.some((row) => !/^\d{2}:\d{2}$/.test(row.startsAt) || !/^\d{2}:\d{2}$/.test(row.endsAt) || row.startsAt >= row.endsAt)) {
    throw new Error("Revise os horários da disponibilidade.");
  }
  const [professional] = await db.select({ id: professionals.id }).from(professionals).where(and(
    eq(professionals.id, professionalId), eq(professionals.organizationId, organization.id),
  )).limit(1);
  if (!professional) throw new Error("Profissional não encontrado.");
  await db.transaction(async (tx) => {
    await tx.delete(weeklyAvailability).where(and(eq(weeklyAvailability.organizationId, organization.id), eq(weeklyAvailability.professionalId, professionalId)));
    if (rows.length) await tx.insert(weeklyAvailability).values(rows.map(({ dayOfWeek, startsAt, endsAt }) => ({
      organizationId: organization.id, professionalId, dayOfWeek, startsAt, endsAt,
    })));
  });
  revalidatePath("/equipe");
  revalidatePath("/agendamentos");
}

export async function deleteUnifiedTeamMember(formData: FormData) {
  const { session, organization } = await requireOrganizationMembership();
  assertOrganizationPermission(organization.role, "team.manage");
  const userId = field(formData, "userId");
  if (userId === session.user.id) throw new Error("Você não pode excluir a própria conta.");
  await db.transaction(async (tx) => {
    await tx.delete(professionals).where(and(eq(professionals.organizationId, organization.id), eq(professionals.userId, userId)));
    await tx.delete(organizationMembers).where(and(eq(organizationMembers.organizationId, organization.id), eq(organizationMembers.userId, userId)));
  });
  revalidatePath("/equipe");
}

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
    "financial",
  ] as const;
  const role = allowedRoles.includes(requestedRole as (typeof allowedRoles)[number])
    ? (requestedRole as (typeof allowedRoles)[number])
    : "receptionist";
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

export type TeamAccessActionState = {
  error?: string;
  success?: boolean;
  savedRole?: "admin" | "manager" | "receptionist" | "professional" | "financial";
  submissionId?: string;
};

export async function updateTeamMemberAccess(
  _previousState: TeamAccessActionState,
  formData: FormData
): Promise<TeamAccessActionState> {
  try {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "team.manage");
  const userId = String(formData.get("userId") ?? "");
  const requestedRole = String(formData.get("role") ?? "receptionist");
  const professionalId = String(formData.get("professionalId") ?? "");
  const allowedRoles = ["admin", "manager", "receptionist", "professional", "financial"] as const;
  const role = allowedRoles.includes(requestedRole as (typeof allowedRoles)[number])
    ? requestedRole as (typeof allowedRoles)[number]
    : "receptionist";
  const [member] = await db.select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organization.id), eq(organizationMembers.userId, userId)))
    .limit(1);
  if (!member) return { error: "Membro não encontrado nesta empresa." };
  const [linkedProfessional] = await db.select({ id: professionals.id })
    .from(professionals)
    .where(and(
      eq(professionals.organizationId, organization.id),
      eq(professionals.userId, userId),
      eq(professionals.isActive, true),
    ))
    .limit(1);
  const effectiveProfessionalId = professionalId || linkedProfessional?.id || "";
  if (role === "professional" && !effectiveProfessionalId) {
    return { error: "Selecione qual profissional esta conta representa." };
  }

  await db.transaction(async (tx) => {
    const [updatedMember] = await tx.update(organizationMembers).set({ role }).where(and(
      eq(organizationMembers.organizationId, organization.id),
      eq(organizationMembers.userId, userId),
    )).returning({ role: organizationMembers.role });
    if (!updatedMember || updatedMember.role !== role) {
      throw new Error("O perfil salvo não corresponde ao perfil solicitado.");
    }
    if (role === "professional") {
      const updated = await tx.update(professionals).set({ userId, updatedAt: new Date() }).where(and(
        eq(professionals.id, effectiveProfessionalId),
        eq(professionals.organizationId, organization.id),
        eq(professionals.isActive, true),
      )).returning({ id: professionals.id });
      if (!updated.length) throw new Error("Profissional inválido para esta empresa.");
    }
  });
  revalidatePath("/equipe");
  return { success: true, savedRole: role, submissionId: crypto.randomUUID() };
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      message: "Falha ao atualizar acesso da equipe",
      error: error instanceof Error ? error.message : String(error),
    }));
    return { error: "Não foi possível salvar o acesso. Atualize a página e tente novamente." };
  }
}
