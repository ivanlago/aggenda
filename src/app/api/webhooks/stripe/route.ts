import { eq } from "drizzle-orm";
import Stripe from "stripe";

import { db } from "@/db";
import {
  organizationSubscriptions,
  stripeWebhookEvents,
} from "@/db/schema";
import { getStripe } from "@/lib/stripe";

function subscriptionStatus(status: Stripe.Subscription.Status) {
  if (status === "active") return "active" as const;
  if (status === "trialing") return "trialing" as const;
  if (status === "past_due" || status === "unpaid") return "past_due" as const;
  if (status === "canceled") return "canceled" as const;
  return "incomplete" as const;
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const organizationId = subscription.metadata.organizationId;
  if (!organizationId) return;

  await db
    .update(organizationSubscriptions)
    .set({
      plan: "essential",
      status: subscriptionStatus(subscription.status),
      stripeCustomerId:
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id,
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.items.data[0]?.price.id,
      currentPeriodEnd: subscription.items.data[0]?.current_period_end
        ? new Date(subscription.items.data[0].current_period_end * 1000)
        : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      updatedAt: new Date(),
    })
    .where(eq(organizationSubscriptions.organizationId, organizationId));
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return Response.json({ error: "Webhook não configurado." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      await request.text(),
      signature,
      webhookSecret
    );
  } catch {
    return Response.json({ error: "Assinatura inválida." }, { status: 400 });
  }

  const [processed] = await db
    .select({ id: stripeWebhookEvents.id })
    .from(stripeWebhookEvents)
    .where(eq(stripeWebhookEvents.id, event.id))
    .limit(1);
  if (processed) return Response.json({ received: true });

  await db.transaction(async (tx) => {
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await syncSubscription(event.data.object);
    }
    await tx.insert(stripeWebhookEvents).values({
      id: event.id,
      type: event.type,
    });
  });

  return Response.json({ received: true });
}
