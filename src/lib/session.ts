import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/db";
import {
  organizationMembers,
  organizationSubscriptions,
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
      bookingEnabled: organizations.bookingEnabled,
      bookingNoticeHours: organizations.bookingNoticeHours,
      bookingHorizonDays: organizations.bookingHorizonDays,
      slotIntervalMinutes: organizations.slotIntervalMinutes,
      clientLabel: organizations.clientLabel,
      clientLabelPlural: organizations.clientLabelPlural,
      professionalLabel: organizations.professionalLabel,
      professionalLabelPlural: organizations.professionalLabelPlural,
      serviceLabel: organizations.serviceLabel,
      serviceLabelPlural: organizations.serviceLabelPlural,
      appointmentLabel: organizations.appointmentLabel,
      appointmentLabelPlural: organizations.appointmentLabelPlural,
      role: organizationMembers.role,
      subscriptionStatus: organizationSubscriptions.status,
      subscriptionPlan: organizationSubscriptions.plan,
      trialEndsAt: organizationSubscriptions.trialEndsAt,
      currentPeriodEnd: organizationSubscriptions.currentPeriodEnd,
    })
    .from(organizationMembers)
    .innerJoin(
      organizations,
      eq(organizations.id, organizationMembers.organizationId)
    )
    .leftJoin(
      organizationSubscriptions,
      eq(organizationSubscriptions.organizationId, organizations.id)
    )
    .where(eq(organizationMembers.userId, userId))
    .limit(1);

  return membership;
});

export async function requireOrganizationMembership() {
  const session = await requireSession();
  const organization = await getCurrentOrganization(session.user.id);
  if (!organization) redirect("/onboarding");
  return { session, organization };
}

export function hasActiveSubscription(organization: {
  subscriptionStatus: "trialing" | "active" | "past_due" | "canceled" | "incomplete" | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}) {
  if (organization.subscriptionStatus === "active") return true;
  if (
    organization.subscriptionStatus === "trialing" &&
    organization.trialEndsAt &&
    organization.trialEndsAt > new Date()
  ) {
    return true;
  }
  if (
    organization.subscriptionStatus === "canceled" &&
    organization.currentPeriodEnd &&
    organization.currentPeriodEnd > new Date()
  ) {
    return true;
  }
  return false;
}

export async function requireOrganization() {
  const context = await requireOrganizationMembership();
  if (!hasActiveSubscription(context.organization)) redirect("/assinatura");
  return context;
}
