"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { organizationSubscriptions } from "@/db/schema";
import { requireOrganizationMembership } from "@/lib/session";
import { getStripe } from "@/lib/stripe";

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export async function startCheckout() {
  const { session, organization } = await requireOrganizationMembership();
  if (organization.role !== "owner") {
    throw new Error("Somente o proprietário pode contratar um plano.");
  }

  const priceId = process.env.STRIPE_PRICE_ESSENTIAL;
  if (!priceId) throw new Error("STRIPE_PRICE_ESSENTIAL não configurado.");

  const stripe = getStripe();
  let customerId = (
    await db
      .select({ id: organizationSubscriptions.stripeCustomerId })
      .from(organizationSubscriptions)
      .where(eq(organizationSubscriptions.organizationId, organization.id))
      .limit(1)
  )[0]?.id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      name: organization.name,
      email: session.user.email,
      metadata: { organizationId: organization.id },
    });
    customerId = customer.id;
    await db
      .update(organizationSubscriptions)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(organizationSubscriptions.organizationId, organization.id));
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: organization.id,
    metadata: { organizationId: organization.id },
    subscription_data: {
      metadata: { organizationId: organization.id },
    },
    success_url: `${appUrl()}/assinatura?checkout=sucesso`,
    cancel_url: `${appUrl()}/assinatura?checkout=cancelado`,
    allow_promotion_codes: true,
  });

  if (!checkout.url) throw new Error("A Stripe não retornou a URL de pagamento.");
  redirect(checkout.url);
}

export async function openBillingPortal() {
  const { organization } = await requireOrganizationMembership();
  if (organization.role !== "owner") {
    throw new Error("Somente o proprietário pode gerenciar a cobrança.");
  }

  const [subscription] = await db
    .select({ customerId: organizationSubscriptions.stripeCustomerId })
    .from(organizationSubscriptions)
    .where(eq(organizationSubscriptions.organizationId, organization.id))
    .limit(1);

  if (!subscription?.customerId) redirect("/assinatura");

  const portal = await getStripe().billingPortal.sessions.create({
    customer: subscription.customerId,
    return_url: `${appUrl()}/assinatura`,
  });
  redirect(portal.url);
}
