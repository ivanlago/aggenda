"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { organizationMembers, supportSessions } from "@/db/schema";
import {
  activeOrganizationCookie,
  requirePlatformMember,
  requireSession,
} from "@/lib/session";

export async function selectActiveOrganization(formData: FormData) {
  const session = await requireSession();
  const organizationId = String(formData.get("organizationId") ?? "");
  const [membership] = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, session.user.id),
        eq(organizationMembers.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!membership) throw new Error("Você não possui acesso a esta empresa.");
  const cookieStore = await cookies();
  cookieStore.set(activeOrganizationCookie, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function startSupportSession(formData: FormData) {
  const { session, platform } = await requirePlatformMember([
    "super_admin",
    "support",
    "operations",
  ]);
  const organizationId = String(formData.get("organizationId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const requestedAccess = String(formData.get("accessLevel") ?? "read_only");
  if (reason.length < 10) throw new Error("Informe um motivo de suporte detalhado.");
  const accessLevel =
    platform.role === "super_admin" && requestedAccess === "operational"
      ? "operational"
      : "read_only";
  await db.insert(supportSessions).values({
    platformUserId: session.user.id,
    organizationId,
    reason,
    accessLevel,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  revalidatePath(`/admin/empresas/${organizationId}`);
}
