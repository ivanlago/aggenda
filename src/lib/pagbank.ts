import { pagBankInstallmentPolicy } from "./payment-catalog-policy";
import { ProviderRequestError } from "./provider-request-error";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { organizationFinancialIntegrations } from "@/db/schema";
import { decryptFinancialCredential } from "@/lib/financial-secret";

export type PagBankCredential = { token: string };
export type PagBankEnvironment = "sandbox" | "production";

const baseUrl = (environment: string) => environment === "production" ? "https://api.pagseguro.com" : "https://sandbox.api.pagseguro.com";

export async function pagBankRequest<T>(path: string, credential: PagBankCredential & { environment: string }, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}) {
  const response = await fetch(`${baseUrl(credential.environment)}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${credential.token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.idempotencyKey ? { "x-idempotency-key": init.idempotencyKey } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new ProviderRequestError(`PagBank recusou a operação (${response.status}): ${detail.slice(0, 350)}`, response.status);
  }
  return response.json() as Promise<T>;
}

export async function getPagBankCredential(organizationId: string) {
  const [integration] = await db.select().from(organizationFinancialIntegrations).where(and(eq(organizationFinancialIntegrations.organizationId, organizationId), eq(organizationFinancialIntegrations.provider, "pagbank"))).limit(1);
  if (!integration || integration.status !== "active") throw new Error("Conecte e teste a conta PagBank antes de gerar pagamentos.");
  const credential = JSON.parse(decryptFinancialCredential(integration.encryptedCredential)) as PagBankCredential;
  const installments = pagBankInstallmentPolicy(integration.metadata?.maxCardInstallments, integration.metadata?.interestFreeCardInstallments);
  return { ...credential, environment: integration.environment, installments };
}
