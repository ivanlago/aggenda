import { eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { organizationServicePlans } from "@/db/schema";

export const corePlanCodes = ["solo_agenda", "solo_gestao", "core"] as const;
export type CorePlanCode = (typeof corePlanCodes)[number];

export const whatsappServiceCodes = [
  "assisted",
  "notify",
  "menu",
  "chat",
  "chat_ai",
  "core_ai",
] as const;
export type WhatsAppServiceCode = (typeof whatsappServiceCodes)[number];
export const nfseServiceCodes = ["none", "emitter"] as const;
export type NfseServiceCode = (typeof nfseServiceCodes)[number];

export const nfseServices: Record<NfseServiceCode, { name: string; description: string }> = {
  none: { name: "Sem NFS-e", description: "Emissor fiscal não contratado." },
  emitter: { name: "Emissor NFS-e", description: "Emissão government-first com fallback fiscal quando necessário." },
};

export const nfsePublicOffer = {
  monthlyPriceInCents: 4990,
  monthlyLimit: 100,
  overageInCents: 49,
  assistedSetupInCents: 14900,
} as const;

export const corePlans: Record<CorePlanCode, {
  name: string;
  description: string;
  professionalLimit: number | null;
  userLimit: number | null;
}> = {
  solo_agenda: {
    name: "Solo Agenda",
    description: "Agenda, clientes e página pública para um profissional.",
    professionalLimit: 1,
    userLimit: 1,
  },
  solo_gestao: {
    name: "Solo Gestão",
    description: "Operação individual com financeiro, pacotes e dados.",
    professionalLimit: 1,
    userLimit: 1,
  },
  core: {
    name: "Core",
    description: "Gestão completa para clínicas e equipes.",
    professionalLimit: null,
    userLimit: null,
  },
};

export const whatsappServices: Record<WhatsAppServiceCode, {
  name: string;
  description: string;
  usesCloudApi: boolean;
  usesAi: boolean;
  workflowProduct: "CHAT" | "CHAT_AI" | "CORE" | "CORE_AI" | null;
}> = {
  assisted: {
    name: "WhatsApp Assistido",
    description: "Mensagens prontas abertas para envio manual, sem custo de API.",
    usesCloudApi: false,
    usesAi: false,
    workflowProduct: null,
  },
  notify: {
    name: "WhatsApp Notify",
    description: "Confirmações e lembretes automáticos, sem atendimento por bot.",
    usesCloudApi: true,
    usesAi: false,
    workflowProduct: null,
  },
  menu: {
    name: "WhatsApp Menu",
    description: "Menu determinístico para dúvidas e encaminhamento humano.",
    usesCloudApi: true,
    usesAi: false,
    workflowProduct: "CHAT",
  },
  chat: {
    name: "WhatsApp Chat",
    description: "FAQ, coleta de dados e atendimento estruturado sem IA aberta.",
    usesCloudApi: true,
    usesAi: false,
    workflowProduct: "CHAT",
  },
  chat_ai: {
    name: "WhatsApp Chat + AI",
    description: "Linguagem natural, base aprovada e transferência humana.",
    usesCloudApi: true,
    usesAi: true,
    workflowProduct: "CHAT_AI",
  },
  core_ai: {
    name: "WhatsApp Core + AI",
    description: "Agente que consulta disponibilidade e opera agendamentos com confirmação.",
    usesCloudApi: true,
    usesAi: true,
    workflowProduct: "CORE_AI",
  },
};

export function isCorePlanCode(value: string): value is CorePlanCode {
  return corePlanCodes.includes(value as CorePlanCode);
}

export function isWhatsAppServiceCode(value: string): value is WhatsAppServiceCode {
  return whatsappServiceCodes.includes(value as WhatsAppServiceCode);
}
export function isNfseServiceCode(value: string): value is NfseServiceCode { return nfseServiceCodes.includes(value as NfseServiceCode); }

const legacyConfiguration = {
  corePlanCode: "core" as CorePlanCode,
  whatsappServiceCode: "core_ai" as WhatsAppServiceCode,
  whatsappMonthlyLimit: 0,
  aiMonthlyLimit: 0,
  nfseServiceCode: "none" as NfseServiceCode,
  nfseMonthlyLimit: nfsePublicOffer.monthlyLimit,
  nfseOverageInCents: nfsePublicOffer.overageInCents,
  nfseMonthlyPriceInCents: nfsePublicOffer.monthlyPriceInCents,
  isLegacyFallback: true,
};

export const getOrganizationServicePlan = cache(async (organizationId: string) => {
  const [plan] = await db
    .select()
    .from(organizationServicePlans)
    .where(eq(organizationServicePlans.organizationId, organizationId))
    .limit(1);

  if (!plan) return legacyConfiguration;
  const corePlanCode = isCorePlanCode(plan.corePlanCode) ? plan.corePlanCode : "core";
  const whatsappServiceCode = isWhatsAppServiceCode(plan.whatsappServiceCode)
    ? plan.whatsappServiceCode
    : "assisted";
  const nfseServiceCode = isNfseServiceCode(plan.nfseServiceCode) ? plan.nfseServiceCode : "none";
  return { ...plan, corePlanCode, whatsappServiceCode, nfseServiceCode, isLegacyFallback: false };
});
