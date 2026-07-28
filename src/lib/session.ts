import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/db";
import {
  organizationMembers,
  organizations,
} from "@/db/schema";
import { auth } from "@/lib/auth";

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export async function requireSession() {
  const session = await getSession();
  if (!session?.user) redirect("/entrar");
  return session;
}

export const getCurrentOrganization = cache(async (userId: string) => {
  const [membership] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      timezone: organizations.timezone,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .innerJoin(
      organizations,
      eq(organizations.id, organizationMembers.organizationId)
    )
    .where(eq(organizationMembers.userId, userId))
    .limit(1);

  return membership;
});

export async function requireOrganization() {
  const session = await requireSession();
  const organization = await getCurrentOrganization(session.user.id);
  if (!organization) redirect("/onboarding");
  return { session, organization };
}
