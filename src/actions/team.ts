"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import {
  organizationInvitations,
  organizationMembers,
} from "@/db/schema";
import {
  requireOrganization,
  requireOrganizationMembership,
  requireSession,
} from "@/lib/session";

export async function inviteTeamMember(formData: FormData) {
  const { session, organization } = await requireOrganization();
  if (!["owner", "admin"].includes(organization.role)) {
    throw new Error("Você não tem permissão para convidar pessoas.");
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const requestedRole = String(formData.get("role") ?? "member");
  const role = requestedRole === "admin" ? "admin" : "member";
  if (!email.includes("@")) throw new Error("Informe um e-mail válido.");

  const token = crypto.randomUUID();
  await db
    .insert(organizationInvitations)
    .values({
      organizationId: organization.id,
      invitedByUserId: session.user.id,
      email,
      role,
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    .onConflictDoUpdate({
      target: [
        organizationInvitations.organizationId,
        organizationInvitations.email,
      ],
      set: {
        invitedByUserId: session.user.id,
        role,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        acceptedAt: null,
      },
    });

  revalidatePath("/equipe");
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
