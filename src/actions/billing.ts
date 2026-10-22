"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { organizationSubscriptions } from "@/db/schema";
import { asaasRequest } from "@/lib/asaas";
import { requireOrganizationMembership } from "@/lib/session";

export async function startCheckout() {
  redirect("/assinatura?checkout=erro&message=O%20checkout%20foi%20atualizado.%20Escolha%20seu%20plano%20ou%20abra%20um%20convite%20válido.");
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
