import { ProviderRequestError } from "./provider-request-error";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { organizationFinancialIntegrations } from "@/db/schema";
import { decryptFinancialCredential } from "@/lib/financial-secret";

export type MercadoPagoCredential = { accessToken: string; webhookSecret?: string };

export async function mercadoPagoRequest<T>(path: string, accessToken: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}) {
  const response = await fetch(`https://api.mercadopago.com${path}`, { method: init.method ?? "GET", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init.idempotencyKey ? { "X-Idempotency-Key": init.idempotencyKey } : {}) }, body: init.body === undefined ? undefined : JSON.stringify(init.body), cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    const detail = await response.text();
    let code: string | undefined;
    try {
      const parsed = JSON.parse(detail) as { error?: unknown; cause?: { code?: unknown }[] };
      const candidate = parsed.cause?.[0]?.code ?? parsed.error;
      if ((typeof candidate === "string" || typeof candidate === "number") && /^[a-zA-Z0-9_.:-]{1,100}$/.test(String(candidate))) code = String(candidate);
    } catch { /* Keep unknown responses out of persisted metadata. */ }
    throw new ProviderRequestError(`Mercado Pago recusou a operação (${response.status}): ${detail.slice(0, 350)}`, response.status, code);
  }
  return response.json() as Promise<T>;
}

export async function getMercadoPagoCredential(organizationId: string) {
  const [integration] = await db.select().from(organizationFinancialIntegrations).where(and(eq(organizationFinancialIntegrations.organizationId, organizationId), eq(organizationFinancialIntegrations.provider, "mercado_pago"))).limit(1);
  if (!integration || integration.status !== "active") throw new Error("Conecte e teste a conta Mercado Pago antes de gerar pagamentos.");
  const parsed = JSON.parse(decryptFinancialCredential(integration.encryptedCredential)) as MercadoPagoCredential;
  return { ...parsed, environment: integration.environment };
}
