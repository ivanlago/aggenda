"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { organizationServicePlans } from "@/db/schema";
import {
  isCorePlanCode,
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
  if (!organizationId || !isCorePlanCode(corePlanCode)) {
    throw new Error("Plano Core inválido.");
  }
  if (!isWhatsAppServiceCode(whatsappServiceCode)) {
    throw new Error("Serviço de WhatsApp inválido.");
  }

  const whatsappMonthlyLimit = boundedLimit(formData, "whatsappMonthlyLimit");
  const aiMonthlyLimit = boundedLimit(formData, "aiMonthlyLimit");
  await db
    .insert(organizationServicePlans)
    .values({
      organizationId,
      corePlanCode,
      whatsappServiceCode,
      whatsappMonthlyLimit,
      aiMonthlyLimit,
    })
    .onConflictDoUpdate({
      target: organizationServicePlans.organizationId,
      set: {
        corePlanCode,
        whatsappServiceCode,
        whatsappMonthlyLimit,
        aiMonthlyLimit,
        updatedAt: new Date(),
      },
    });

  revalidatePath(`/admin/empresas/${organizationId}`);
  revalidatePath("/automacoes");
  revalidatePath("/", "layout");
}
