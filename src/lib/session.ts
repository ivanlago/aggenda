import { and, asc, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/db";
import {
  organizationMembers,
  organizationSubscriptions,
  organizations,
  platformMembers,
  professionals,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import type { PlatformRole } from "@/lib/permissions";

export const activeOrganizationCookie = "aggenda_active_organization";

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export async function requireSession() {
  const session = await getSession();
  if (!session?.user) redirect("/entrar");
  return session;
}

export const getOrganizationMemberships = cache(async (userId: string) => {
  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      businessType: organizations.businessType,
      slug: organizations.slug,
      timezone: organizations.timezone,
      bookingEnabled: organizations.bookingEnabled,
      bookingNoticeHours: organizations.bookingNoticeHours,
      bookingHorizonDays: organizations.bookingHorizonDays,
      slotIntervalMinutes: organizations.slotIntervalMinutes,
      publicDescription: organizations.publicDescription,
      phone: organizations.phone,
      publicAddress: organizations.publicAddress,
      publicLogoUrl: organizations.publicLogoUrl,
      publicCoverUrl: organizations.publicCoverUrl,
      legalName: organizations.legalName,
      taxId: organizations.taxId,
      publicEmail: organizations.publicEmail,
      publicWebsite: organizations.publicWebsite,
      publicWhatsapp: organizations.publicWhatsapp,
      documentFooter: organizations.documentFooter,
      brandColor: organizations.brandColor,
      customDomain: organizations.customDomain,
      customDomainVerifiedAt: organizations.customDomainVerifiedAt,
      reminderOffsetsHours: organizations.reminderOffsetsHours,
      reminderConfirmationEnabled: organizations.reminderConfirmationEnabled,
      patientRecoveryDays: organizations.patientRecoveryDays,
      cancellationPolicy: organizations.cancellationPolicy,
      depositRefundPolicy: organizations.depositRefundPolicy,
      latenessPolicy: organizations.latenessPolicy,
      publicPrivacyPolicy: organizations.publicPrivacyPolicy,
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
    .orderBy(asc(organizations.createdAt));
});

export const getCurrentOrganization = cache(async (
  userId: string,
  requestedOrganizationId: string | null = null
) => {
  const memberships = await getOrganizationMemberships(userId);
  return (
    memberships.find((membership) => membership.id === requestedOrganizationId) ??
    memberships[0]
  );
});

export async function requireOrganizationMembership() {
  const session = await requireSession();
  const cookieStore = await cookies();
  const organization = await getCurrentOrganization(
    session.user.id,
    cookieStore.get(activeOrganizationCookie)?.value ?? null
  );
  if (!organization) redirect("/onboarding");
  return { session, organization };
}

export const getOrganizationProfessionalId = cache(async (
  organizationId: string,
  userId: string,
) => {
  const [professional] = await db
    .select({ id: professionals.id })
    .from(professionals)
    .where(and(
      eq(professionals.organizationId, organizationId),
      eq(professionals.userId, userId),
      eq(professionals.isActive, true),
    ))
    .limit(1);
  return professional?.id ?? null;
});

export async function requireProfessionalScope(organizationId: string, userId: string) {
  const professionalId = await getOrganizationProfessionalId(organizationId, userId);
  if (!professionalId) {
    throw new Error("Sua conta profissional ainda não foi vinculada ao cadastro da equipe.");
  }
  return professionalId;
}

export const getPlatformMembership = cache(async (userId: string) => {
  const [membership] = await db
    .select({ role: platformMembers.role })
    .from(platformMembers)
    .where(
      and(
        eq(platformMembers.userId, userId),
        eq(platformMembers.isActive, true)
      )
    )
    .limit(1);
  return membership;
});

export async function requirePlatformMember(allowedRoles?: PlatformRole[]) {
  const session = await requireSession();
  const membership = await getPlatformMembership(session.user.id);
  if (!membership || (allowedRoles && !allowedRoles.includes(membership.role))) {
    redirect("/dashboard");
  }
  return { session, platform: membership };
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
