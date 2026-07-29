"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { organizationSubscriptions } from "@/db/schema";
import { asaasCheckoutLink, asaasRequest } from "@/lib/asaas";
import { requireOrganizationMembership } from "@/lib/session";

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function planValue() {
  const value = Number(process.env.ASAAS_PLAN_VALUE || "99");
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("ASAAS_PLAN_VALUE deve ser um valor positivo.");
  }
  return value;
}

function asaasDate(date: Date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

type CheckoutResponse = {
  id: string;
  link?: string | null;
};

export async function startCheckout() {
  const { session, organization } = await requireOrganizationMembership();
  if (organization.role !== "owner") {
    throw new Error("Somente o proprietário pode contratar um plano.");
  }

  const now = new Date();
  const checkout = await asaasRequest<CheckoutResponse>("/checkouts", {
    method: "POST",
    body: {
      billingTypes: ["CREDIT_CARD"],
      chargeTypes: ["RECURRENT"],
      minutesToExpire: 1440,
      externalReference: organization.id,
      callback: {
        successUrl: `${appUrl()}/assinatura?checkout=sucesso`,
        cancelUrl: `${appUrl()}/assinatura?checkout=cancelado`,
        expiredUrl: `${appUrl()}/assinatura?checkout=expirado`,
      },
      items: [
        {
          externalReference: "essential-monthly",
          name: "Plano Essencial Aggenda",
          description: "Assinatura mensal do sistema Aggenda",
          quantity: 1,
          value: planValue(),
        },
      ],
      customerData: {
        name: session.user.name,
        email: session.user.email,
      },
      subscription: {
        cycle: "MONTHLY",
        nextDueDate: asaasDate(now),
      },
    },
  });

  await db
    .update(organizationSubscriptions)
    .set({
      billingProvider: "asaas",
      billingCheckoutId: checkout.id,
      status: "incomplete",
      updatedAt: new Date(),
    })
    .where(eq(organizationSubscriptions.organizationId, organization.id));

  redirect(asaasCheckoutLink(checkout));
}

export async function cancelSubscription() {
  const { organization } = await requireOrganizationMembership();
  if (organization.role !== "owner") {
    throw new Error("Somente o proprietário pode cancelar a assinatura.");
  }

  const [subscription] = await db
    .select({
      id: organizationSubscriptions.billingSubscriptionId,
      provider: organizationSubscriptions.billingProvider,
    })
    .from(organizationSubscriptions)
    .where(eq(organizationSubscriptions.organizationId, organization.id))
    .limit(1);

  if (!subscription?.id || subscription.provider !== "asaas") {
    throw new Error("Assinatura Asaas não encontrada.");
  }

  await asaasRequest(`/subscriptions/${subscription.id}`, { method: "DELETE" });
  await db
    .update(organizationSubscriptions)
    .set({
      status: "canceled",
      cancelAtPeriodEnd: true,
      updatedAt: new Date(),
    })
    .where(eq(organizationSubscriptions.organizationId, organization.id));

  revalidatePath("/assinatura");
}
