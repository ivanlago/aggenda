import { timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  billingWebhookEvents,
  organizationSubscriptions,
} from "@/db/schema";

type AsaasSubscription = {
  id: string;
  customer?: string;
  status?: string;
  externalReference?: string | null;
  nextDueDate?: string | null;
  deleted?: boolean;
};

type AsaasPayment = {
  id: string;
  customer?: string;
  subscription?: string | null;
  externalReference?: string | null;
  dueDate?: string | null;
};

type AsaasCheckout = {
  id: string;
  status?: string;
  customer?: string | null;
  externalReference?: string | null;
};

type AsaasWebhook = {
  id: string;
  event: string;
  subscription?: AsaasSubscription;
  payment?: AsaasPayment;
  checkout?: AsaasCheckout;
};

function validWebhookToken(received: string | null) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!received || !expected) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function validOrganizationId(value?: string | null) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function nextMonthlyPeriod(dueDate?: string | null) {
  const date = dueDate ? new Date(`${dueDate}T12:00:00Z`) : new Date();
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date;
}

async function findOrganizationId(event: AsaasWebhook) {
  const externalReference =
    validOrganizationId(event.subscription?.externalReference) ||
    validOrganizationId(event.payment?.externalReference) ||
    validOrganizationId(event.checkout?.externalReference);
  if (externalReference) return externalReference;

  if (event.checkout?.id) {
    const [record] = await db
      .select({ organizationId: organizationSubscriptions.organizationId })
      .from(organizationSubscriptions)
      .where(eq(organizationSubscriptions.billingCheckoutId, event.checkout.id))
      .limit(1);
    if (record) return record.organizationId;
  }

  const subscriptionId =
    event.subscription?.id || event.payment?.subscription || undefined;
  if (subscriptionId) {
    const [record] = await db
      .select({ organizationId: organizationSubscriptions.organizationId })
      .from(organizationSubscriptions)
      .where(eq(organizationSubscriptions.billingSubscriptionId, subscriptionId))
      .limit(1);
    if (record) return record.organizationId;
  }

  const customerId = event.subscription?.customer || event.payment?.customer;
  if (customerId) {
    const [record] = await db
      .select({ organizationId: organizationSubscriptions.organizationId })
      .from(organizationSubscriptions)
      .where(eq(organizationSubscriptions.billingCustomerId, customerId))
      .limit(1);
    return record?.organizationId;
  }
}

export async function POST(request: Request) {
  if (!validWebhookToken(request.headers.get("asaas-access-token"))) {
    return Response.json({ error: "Token de webhook inválido." }, { status: 401 });
  }

  let event: AsaasWebhook;
  try {
    event = (await request.json()) as AsaasWebhook;
  } catch {
    return Response.json({ error: "Payload inválido." }, { status: 400 });
  }

  if (!event.id || !event.event) {
    return Response.json({ error: "Evento inválido." }, { status: 400 });
  }

  const organizationId = await findOrganizationId(event);

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(billingWebhookEvents)
      .values({ id: event.id, provider: "asaas", type: event.event })
      .onConflictDoNothing()
      .returning({ id: billingWebhookEvents.id });
    if (!inserted.length || !organizationId) return;

    const subscription = event.subscription;
    const payment = event.payment;
    const checkout = event.checkout;

    if (checkout && event.event === "CHECKOUT_PAID") {
      await tx
        .update(organizationSubscriptions)
        .set({
          billingProvider: "asaas",
          billingCustomerId: checkout.customer || undefined,
          updatedAt: new Date(),
        })
        .where(eq(organizationSubscriptions.organizationId, organizationId));
    }

    if (
      subscription &&
      (event.event === "SUBSCRIPTION_CREATED" ||
        event.event === "SUBSCRIPTION_UPDATED")
    ) {
      await tx
        .update(organizationSubscriptions)
        .set({
          plan: "essential",
          billingProvider: "asaas",
          billingCustomerId: subscription.customer,
          billingSubscriptionId: subscription.id,
          cancelAtPeriodEnd: false,
          updatedAt: new Date(),
        })
        .where(eq(organizationSubscriptions.organizationId, organizationId));
    }

    if (
      event.event === "SUBSCRIPTION_INACTIVATED" ||
      event.event === "SUBSCRIPTION_DELETED"
    ) {
      await tx
        .update(organizationSubscriptions)
        .set({
          status: "canceled",
          cancelAtPeriodEnd: true,
          updatedAt: new Date(),
        })
        .where(eq(organizationSubscriptions.organizationId, organizationId));
    }

    if (
      payment &&
      (event.event === "PAYMENT_CONFIRMED" ||
        event.event === "PAYMENT_RECEIVED")
    ) {
      await tx
        .update(organizationSubscriptions)
        .set({
          plan: "essential",
          status: "active",
          billingProvider: "asaas",
          billingCustomerId: payment.customer,
          billingSubscriptionId: payment.subscription || undefined,
          lastPaymentId: payment.id,
          currentPeriodEnd: nextMonthlyPeriod(payment.dueDate),
          cancelAtPeriodEnd: false,
          updatedAt: new Date(),
        })
        .where(eq(organizationSubscriptions.organizationId, organizationId));
    }

    if (
      payment &&
      (event.event === "PAYMENT_OVERDUE" ||
        event.event === "PAYMENT_REFUNDED" ||
        event.event === "PAYMENT_CHARGEBACK_REQUESTED" ||
        event.event === "PAYMENT_CHARGEBACK_DISPUTE")
    ) {
      await tx
        .update(organizationSubscriptions)
        .set({
          status: "past_due",
          lastPaymentId: payment.id,
          updatedAt: new Date(),
        })
        .where(eq(organizationSubscriptions.organizationId, organizationId));
    }
  });

  return Response.json({ received: true });
}
