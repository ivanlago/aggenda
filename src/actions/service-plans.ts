"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { organizationServicePlans } from "@/db/schema";
import {
  isCorePlanCode,
  isNfseServiceCode,
  isWhatsAppServiceCode,
} from "@/lib/service-plans";
import { requirePlatformMember } from "@/lib/session";

function boundedLimit(formData: FormData, name: string) {
  const value = Number(formData.get(name));
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) {
    throw new Error("Informe uma franquia válida.");
  }
  return value;
}

export async function updateOrganizationServicePlan(formData: FormData) {
  await requirePlatformMember(["super_admin", "billing", "operations"]);
  const organizationId = String(formData.get("organizationId") ?? "");
  const corePlanCode = String(formData.get("corePlanCode") ?? "");
  const whatsappServiceCode = String(formData.get("whatsappServiceCode") ?? "");
  const nfseServiceCode = String(formData.get("nfseServiceCode") ?? "none");
  if (!organizationId || !isCorePlanCode(corePlanCode)) {
    throw new Error("Plano Core inválido.");
  }
  if (!isWhatsAppServiceCode(whatsappServiceCode)) {
    throw new Error("Serviço de WhatsApp inválido.");
  }
  if (!isNfseServiceCode(nfseServiceCode)) throw new Error("Serviço de NFS-e inválido.");

  const whatsappMonthlyLimit = boundedLimit(formData, "whatsappMonthlyLimit");
  const aiMonthlyLimit = boundedLimit(formData, "aiMonthlyLimit");
  const nfseMonthlyLimit = boundedLimit(formData, "nfseMonthlyLimit");
  const nfseOverageInCents = boundedLimit(formData, "nfseOverageInCents");
  const nfseMonthlyPriceInCents = boundedLimit(formData, "nfseMonthlyPriceInCents");
  await db
    .insert(organizationServicePlans)
    .values({
      organizationId,
      corePlanCode,
      whatsappServiceCode,
      whatsappMonthlyLimit,
      aiMonthlyLimit,
      nfseServiceCode,
      nfseMonthlyLimit,
      nfseOverageInCents,
      nfseMonthlyPriceInCents,
    })
    .onConflictDoUpdate({
      target: organizationServicePlans.organizationId,
      set: {
        corePlanCode,
        whatsappServiceCode,
        whatsappMonthlyLimit,
        aiMonthlyLimit,
        nfseServiceCode,
        nfseMonthlyLimit,
        nfseOverageInCents,
        nfseMonthlyPriceInCents,
        updatedAt: new Date(),
      },
    });

  revalidatePath(`/admin/empresas/${organizationId}`);
  revalidatePath("/automacoes");
  revalidatePath("/", "layout");
}
