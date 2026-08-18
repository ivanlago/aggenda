import { request as httpsRequest } from "node:https";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { organizationFinancialIntegrations } from "@/db/schema";
import { decryptFinancialCredential } from "@/lib/financial-secret";

export type EfiCredential = { clientId: string; clientSecret: string; certificateBase64: string; certificatePassword?: string; pixKey: string; webhookHmac: string; environment: string };
type Token = { access_token: string; expires_in?: number };

const baseUrl = (environment: string) => environment === "production" ? "https://pix.api.efipay.com.br" : "https://pix-h.api.efipay.com.br";

function mtlsRequest<T>(url: string, credential: EfiCredential, init: { method?: string; body?: unknown; authorization?: string } = {}) {
  return new Promise<T>((resolve, reject) => {
    const parsed = new URL(url);
    const body = init.body === undefined ? undefined : JSON.stringify(init.body);
    const request = httpsRequest({ hostname: parsed.hostname, path: `${parsed.pathname}${parsed.search}`, method: init.method ?? "GET", pfx: Buffer.from(credential.certificateBase64, "base64"), passphrase: credential.certificatePassword || undefined, headers: { Accept: "application/json", "Content-Type": "application/json", ...(init.authorization ? { Authorization: init.authorization } : {}), ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}) } }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`Efí recusou a operação (${response.statusCode ?? 0}): ${raw.slice(0, 350)}`));
        try { resolve((raw ? JSON.parse(raw) : {}) as T); } catch { reject(new Error("A Efí retornou uma resposta inválida.")); }
      });
    });
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

export async function efiRequest<T>(path: string, credential: EfiCredential, init: { method?: string; body?: unknown } = {}) {
  const basic = Buffer.from(`${credential.clientId}:${credential.clientSecret}`).toString("base64");
  const token = await mtlsRequest<Token>(`${baseUrl(credential.environment)}/oauth/token`, credential, { method: "POST", authorization: `Basic ${basic}`, body: { grant_type: "client_credentials" } });
  return mtlsRequest<T>(`${baseUrl(credential.environment)}${path}`, credential, { ...init, authorization: `Bearer ${token.access_token}` });
}

export async function getEfiCredential(organizationId: string) {
  const [integration] = await db.select().from(organizationFinancialIntegrations).where(and(eq(organizationFinancialIntegrations.organizationId, organizationId), eq(organizationFinancialIntegrations.provider, "efi"))).limit(1);
  if (!integration || integration.status !== "active") throw new Error("Conecte e teste a conta Efí antes de gerar pagamentos.");
  return { ...(JSON.parse(decryptFinancialCredential(integration.encryptedCredential)) as Omit<EfiCredential, "environment">), environment: integration.environment };
}
