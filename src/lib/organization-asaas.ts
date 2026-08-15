import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { organizationFinancialIntegrations } from "@/db/schema";
import { type AsaasEnvironment } from "@/lib/asaas";
import { decryptFinancialCredential } from "@/lib/financial-secret";

export type OrganizationAsaasCredential = {
  apiKey: string;
  webhookToken?: string;
  environment: AsaasEnvironment;
};

function readSecret(encryptedCredential: string) {
  const decrypted = decryptFinancialCredential(encryptedCredential);
  try {
    const parsed = JSON.parse(decrypted) as { apiKey?: unknown; webhookToken?: unknown };
    if (typeof parsed.apiKey === "string") {
      return {
        apiKey: parsed.apiKey,
        webhookToken: typeof parsed.webhookToken === "string" ? parsed.webhookToken : undefined,
      };
    }
  } catch {
    // Compatibilidade com conexões criadas antes do motor de pagamentos.
  }
  return { apiKey: decrypted, webhookToken: undefined };
}

export async function getOrganizationAsaasCredential(organizationId: string) {
  const [integration] = await db.select({
    environment: organizationFinancialIntegrations.environment,
    encryptedCredential: organizationFinancialIntegrations.encryptedCredential,
    status: organizationFinancialIntegrations.status,
  }).from(organizationFinancialIntegrations).where(and(
    eq(organizationFinancialIntegrations.organizationId, organizationId),
    eq(organizationFinancialIntegrations.provider, "asaas"),
  )).limit(1);
  if (!integration || integration.status !== "active") {
    throw new Error("Conecte e teste a conta Asaas antes de gerar cobranças.");
  }
  const secret = readSecret(integration.encryptedCredential);
  return {
    ...secret,
    environment: integration.environment === "production" ? "production" : "sandbox",
  } satisfies OrganizationAsaasCredential;
}

export function decodeOrganizationAsaasCredential(encryptedCredential: string, environment: string) {
  return {
    ...readSecret(encryptedCredential),
    environment: environment === "production" ? "production" : "sandbox",
  } satisfies OrganizationAsaasCredential;
}
