import { timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  billingPayments,
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
  value?: number;
  billingType?: string;
  paymentDate?: string | null;
  confirmedDate?: string | null;
  status?: string;
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

function purchaseReference(value?: string | null) {
  if (!value) return null;
  const [organizationId, planCode, monthsText, paymentMethod] = value.split(":");
  const validId = validOrganizationId(organizationId);
  const months = Number.parseInt(monthsText ?? "", 10);
  if (!validId || !planCode || !Number.isInteger(months) || months < 1 || months > 12) return null;
  return { organizationId: validId, planCode, months, paymentMethod: paymentMethod || null };
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function paymentDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

async function findOrganizationId(event: AsaasWebhook) {
  const purchase = purchaseReference(
    event.subscription?.externalReference || event.payment?.externalReference || event.checkout?.externalReference
  );
  if (purchase) return purchase.organizationId;
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
  const purchase = purchaseReference(
    event.subscription?.externalReference || event.payment?.externalReference || event.checkout?.externalReference
  );

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
    let paymentWasAlreadyPaid = false;

    if (payment) {
      const paid = event.event === "PAYMENT_CONFIRMED" || event.event === "PAYMENT_RECEIVED";
      const [existingPayment] = await tx.select({ status: billingPayments.status })
        .from(billingPayments)
        .where(eq(billingPayments.providerPaymentId, payment.id)).limit(1);
      paymentWasAlreadyPaid = existingPayment?.status === "paid";
      await tx.insert(billingPayments).values({
        organizationId, provider: "asaas", providerPaymentId: payment.id,
        paymentMethod: payment.billingType?.toLowerCase() ?? null,
        amountInCents: payment.value == null ? null : Math.round(payment.value * 100),
        status: paid ? "paid" : (payment.status?.toLowerCase() ?? event.event.toLowerCase()),
        dueDate: paymentDate(payment.dueDate),
        paidAt: paid ? paymentDate(payment.paymentDate || payment.confirmedDate) ?? new Date() : null,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [billingPayments.provider, billingPayments.providerPaymentId],
        set: {
          paymentMethod: payment.billingType?.toLowerCase() ?? null,
          amountInCents: payment.value == null ? null : Math.round(payment.value * 100),
          status: paid ? "paid" : (payment.status?.toLowerCase() ?? event.event.toLowerCase()),
          dueDate: paymentDate(payment.dueDate),
          paidAt: paid ? paymentDate(payment.paymentDate || payment.confirmedDate) ?? new Date() : null,
          updatedAt: new Date(),
        },
      });
    }

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

    if (checkout && (event.event === "CHECKOUT_CANCELED" || event.event === "CHECKOUT_EXPIRED")) {
      const [current] = await tx.select({ status: organizationSubscriptions.status, trialEndsAt: organizationSubscriptions.trialEndsAt })
        .from(organizationSubscriptions).where(eq(organizationSubscriptions.organizationId, organizationId)).limit(1);
      const trialActive = current?.status === "trialing" && current.trialEndsAt && current.trialEndsAt > new Date();
      await tx.update(organizationSubscriptions).set({
        status: trialActive ? "trialing" : "incomplete", updatedAt: new Date(),
      }).where(eq(organizationSubscriptions.organizationId, organizationId));
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
      !paymentWasAlreadyPaid &&
      (event.event === "PAYMENT_CONFIRMED" ||
        event.event === "PAYMENT_RECEIVED")
    ) {
      const [current] = await tx.select({
        currentPeriodEnd: organizationSubscriptions.currentPeriodEnd,
        trialEndsAt: organizationSubscriptions.trialEndsAt,
        pendingPeriodMonths: organizationSubscriptions.pendingPeriodMonths,
        billingPlanCode: organizationSubscriptions.billingPlanCode,
        billingPaymentMethod: organizationSubscriptions.billingPaymentMethod,
      }).from(organizationSubscriptions)
        .where(eq(organizationSubscriptions.organizationId, organizationId)).limit(1);
      const now = new Date();
      const baseCandidates = [now, current?.trialEndsAt, current?.currentPeriodEnd]
        .filter((date): date is Date => Boolean(date && date > now));
      const periodBase = baseCandidates.reduce((latest, date) => date > latest ? date : latest, now);
      const months = Math.max(1, purchase?.months ?? current?.pendingPeriodMonths ?? 1);
      await tx
        .update(organizationSubscriptions)
        .set({
          plan: "essential",
          status: "active",
          billingProvider: "asaas",
          billingCustomerId: payment.customer,
          billingSubscriptionId: payment.subscription || undefined,
          lastPaymentId: payment.id,
          currentPeriodEnd: addMonths(periodBase, months),
          billingPlanCode: purchase?.planCode ?? current?.billingPlanCode ?? "monthly",
          billingPaymentMethod: purchase?.paymentMethod ?? current?.billingPaymentMethod ?? payment.billingType?.toLowerCase(),
          billingIntervalMonths: payment.subscription ? 1 : null,
          pendingPeriodMonths: payment.subscription ? 1 : null,
          cancelAtPeriodEnd: false,
          updatedAt: new Date(),
        })
        .where(eq(organizationSubscriptions.organizationId, organizationId));
      await tx.update(billingPayments).set({ planCode: purchase?.planCode ?? current?.billingPlanCode ?? "monthly" })
        .where(eq(billingPayments.providerPaymentId, payment.id));
    }

    if (
      payment &&
      (event.event === "PAYMENT_OVERDUE" ||
        event.event === "PAYMENT_REFUNDED" ||
        event.event === "PAYMENT_CHARGEBACK_REQUESTED" ||
        event.event === "PAYMENT_CHARGEBACK_DISPUTE")
    ) {
      const [current] = await tx.select({
        lastPaymentId: organizationSubscriptions.lastPaymentId,
        currentPeriodEnd: organizationSubscriptions.currentPeriodEnd,
      }).from(organizationSubscriptions)
        .where(eq(organizationSubscriptions.organizationId, organizationId)).limit(1);
      const reversal = event.event !== "PAYMENT_OVERDUE" && current?.lastPaymentId === payment.id;
      const accessExpired = !current?.currentPeriodEnd || current.currentPeriodEnd <= new Date();
      if (reversal || accessExpired) {
        await tx.update(organizationSubscriptions).set({
          status: "past_due", updatedAt: new Date(),
        }).where(eq(organizationSubscriptions.organizationId, organizationId));
      }
    }
  });

  return Response.json({ received: true });
}
