"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { db } from "@/db";
import { legalAcceptances, organizationSubscriptions } from "@/db/schema";
import { asaasCheckoutLink, asaasRequest } from "@/lib/asaas";
import { asaasBillingType, getBillingPlan, isBillingPlanId, type BillingPaymentMethod } from "@/lib/billing-plans";
import { requireOrganizationMembership } from "@/lib/session";

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function asaasDate(date: Date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function checkoutError(message: string): never {
  redirect(`/assinatura?checkout=erro&message=${encodeURIComponent(message)}`);
}

function requiredText(formData: FormData, key: string, label: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) checkoutError(`Informe ${label}.`);
  return value;
}

function digits(formData: FormData, key: string, label: string) {
  return requiredText(formData, key, label).replace(/\D/g, "");
}

type CheckoutResponse = {
  id: string;
  link?: string | null;
};

export async function startCheckout(formData: FormData) {
  const { session, organization } = await requireOrganizationMembership();
  if (organization.role !== "owner") {
    checkoutError("Somente o proprietário pode contratar um plano.");
  }
  if (formData.get("acceptTerms") !== "on") {
    checkoutError("Aceite os Termos de Uso e a Política de Privacidade.");
  }
  const planId = requiredText(formData, "planId", "o plano");
  if (!isBillingPlanId(planId)) checkoutError("Plano inválido.");
  const paymentMethod = requiredText(formData, "paymentMethod", "a forma de pagamento") as BillingPaymentMethod;
  if (paymentMethod !== "credit_card" && paymentMethod !== "pix") {
    checkoutError("Forma de pagamento inválida.");
  }
  const plan = getBillingPlan(planId);

  const cpfCnpj = digits(formData, "cpfCnpj", "o CPF ou CNPJ");
  if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
    checkoutError("Informe um CPF ou CNPJ válido.");
  }

  let phoneNumber = digits(formData, "phoneNumber", "o telefone");
  if ((phoneNumber.length === 12 || phoneNumber.length === 13) && phoneNumber.startsWith("55")) {
    phoneNumber = phoneNumber.slice(2);
  }
  if (phoneNumber.length < 10 || phoneNumber.length > 11) {
    checkoutError("Informe um telefone brasileiro válido com DDD. O prefixo +55 é opcional.");
  }

  const postalCode = digits(formData, "postalCode", "o CEP");
  if (postalCode.length !== 8) {
    checkoutError("Informe um CEP válido.");
  }

  const address = requiredText(formData, "address", "o endereço");
  const addressNumber = requiredText(
    formData,
    "addressNumber",
    "o número do endereço"
  );
  const province = requiredText(formData, "province", "o bairro");

  const now = new Date();
  const recurring = plan.id === "monthly" && paymentMethod === "credit_card";
  const purchaseReference = `${organization.id}:${plan.id}:${plan.months}:${paymentMethod}`;
  let checkout: CheckoutResponse;
  try {
    checkout = await asaasRequest<CheckoutResponse>("/checkouts", {
      method: "POST",
      body: {
      billingTypes: [asaasBillingType(paymentMethod)],
      chargeTypes: [recurring ? "RECURRENT" : "DETACHED"],
      minutesToExpire: 1440,
      externalReference: purchaseReference,
      callback: {
        successUrl: `${appUrl()}/assinatura?checkout=sucesso`,
        cancelUrl: `${appUrl()}/assinatura?checkout=cancelado`,
        expiredUrl: `${appUrl()}/assinatura?checkout=expirado`,
      },
      items: [
        {
          externalReference: `essential-${plan.id}`,
          name: `Plano Essencial ${plan.name}`,
          description: `${plan.months} ${plan.months === 1 ? "mês" : "meses"} de acesso ao Aggenda`,
          quantity: 1,
          value: plan.value,
        },
      ],
      customerData: {
        name: session.user.name,
        email: session.user.email,
        cpfCnpj,
        phone: phoneNumber,
        postalCode,
        address,
        addressNumber,
        province,
      },
      subscription: recurring ? {
        cycle: "MONTHLY",
        nextDueDate: asaasDate(now),
      } : undefined,
      },
    });
  } catch (error) {
    console.error("[billing] Falha ao criar checkout Asaas", error);
    const message = error instanceof Error ? error.message.slice(0, 300) : "O Asaas não aceitou a criação do checkout.";
    redirect(`/assinatura?checkout=erro&message=${encodeURIComponent(message)}`);
  }

  const requestHeaders = await headers();
  const ipAddress = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const userAgent = requestHeaders.get("user-agent");
  await db.insert(legalAcceptances).values([
    { organizationId: organization.id, userId: session.user.id, document: "terms", version: "2026-08-04", ipAddress, userAgent },
    { organizationId: organization.id, userId: session.user.id, document: "privacy", version: "2026-08-04", ipAddress, userAgent },
  ]).onConflictDoNothing();

  const [current] = await db.select({ status: organizationSubscriptions.status, trialEndsAt: organizationSubscriptions.trialEndsAt })
    .from(organizationSubscriptions)
    .where(eq(organizationSubscriptions.organizationId, organization.id)).limit(1);
  const trialStillActive = current?.status === "trialing" && current.trialEndsAt && current.trialEndsAt > now;
  await db
    .insert(organizationSubscriptions)
    .values({
      organizationId: organization.id,
      plan: current?.status === "trialing" ? "trial" : "essential",
      billingProvider: "asaas",
      billingCheckoutId: checkout.id,
      billingPlanCode: plan.id,
      billingIntervalMonths: recurring ? 1 : null,
      billingPaymentMethod: paymentMethod,
      pendingPeriodMonths: plan.months,
      status: trialStillActive ? "trialing" : "incomplete",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: organizationSubscriptions.organizationId,
      set: {
        billingProvider: "asaas",
        billingCheckoutId: checkout.id,
        billingPlanCode: plan.id,
        billingIntervalMonths: recurring ? 1 : null,
        billingPaymentMethod: paymentMethod,
        pendingPeriodMonths: plan.months,
        status: trialStillActive ? "trialing" : "incomplete",
        updatedAt: new Date(),
      },
    });

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
