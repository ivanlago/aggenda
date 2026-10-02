"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { auditLogs, organizations } from "@/db/schema";
import { normalizeCustomDomain, ownershipRecord, type DomainState } from "@/lib/custom-domain-rules";
import { domainIntegrationReady, DomainProviderError, inspectCustomDomain, VercelDomains } from "@/lib/vercel-domains";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export async function configureCustomDomain(form: FormData): Promise<{ state?: DomainState; error?: string }> {
  const { organization, session } = await requireOrganization();
  assertOrganizationPermission(organization.role, "organization.settings.manage");
  const intent = String(form.get("intent") ?? "connect");
  if (!["connect", "verify", "disconnect"].includes(intent)) return { error: "Ação inválida." };
  if (!domainIntegrationReady()) return { error: "A conexão de domínios ainda precisa ser ativada pela equipe do Aggenda. O endereço padrão continua disponível." };
  try {
    const result = await db.transaction(async (tx) => {
      const [current] = await tx.select({ domain: organizations.customDomain, verifiedAt: organizations.customDomainVerifiedAt }).from(organizations).where(eq(organizations.id, organization.id)).for("update");
      if (!current) return { error: "Empresa não encontrada." };
      const submitted = normalizeCustomDomain(String(form.get("domain") ?? ""), process.env.NEXT_PUBLIC_APP_URL);
      if (current.domain && submitted !== current.domain) return { error: "O domínio mudou. Atualize a página; desconecte o endereço atual antes de trocar." };
      if (intent !== "connect" && !current.domain) return { error: "Nenhum domínio configurado." };
      if (intent === "disconnect") {
        await new VercelDomains().remove(submitted);
        await tx.update(organizations).set({ customDomain: null, customDomainVerifiedAt: null, updatedAt: new Date() }).where(and(eq(organizations.id, organization.id), eq(organizations.customDomain, submitted)));
        await tx.insert(auditLogs).values({ organizationId: organization.id, userId: session.user.id, action: "domain:disconnect", entityType: "custom_domain", details: { domain: submitted } });
        return { state: { domain: null, status: "empty", records: [], message: "Domínio desconectado. O endereço padrão do Aggenda continua disponível." } satisfies DomainState };
      }
      if (!current.domain) await tx.update(organizations).set({ customDomain: submitted, customDomainVerifiedAt: null, updatedAt: new Date() }).where(eq(organizations.id, organization.id));
      // Keep a pending reservation when the provider is temporarily unavailable, so retries are idempotent.
      let state: DomainState;
      try {
        await new VercelDomains().ensure(submitted);
        state = await inspectCustomDomain(organization.id, submitted, current.verifiedAt, intent === "verify");
      } catch (error) {
        if (!(error instanceof DomainProviderError)) throw error;
        state = { domain: submitted, status: "pending", records: [ownershipRecord(organization.id, submitted, process.env.BETTER_AUTH_SECRET ?? "")], message: error.message };
        await tx.update(organizations).set({ customDomainVerifiedAt: null, updatedAt: new Date() }).where(eq(organizations.id, organization.id));
        return { state, error: error.message };
      }
      const connected = state.status === "connected";
      await tx.update(organizations).set({ customDomainVerifiedAt: connected ? current.verifiedAt ?? new Date() : null, updatedAt: new Date() }).where(eq(organizations.id, organization.id));
      await tx.insert(auditLogs).values({ organizationId: organization.id, userId: session.user.id, action: `domain:${intent}`, entityType: "custom_domain", details: { domain: submitted, status: state.status } });
      return { state };
    });
    revalidatePath("/configuracoes");
    revalidatePath("/", "layout");
    return result;
  } catch (error) {
    if (error instanceof DomainProviderError) return { error: error.message };
    if (error instanceof Error && ("code" in error && error.code === "23505" || "cause" in error && error.cause && typeof error.cause === "object" && "code" in error.cause && error.cause.code === "23505")) return { error: "Este domínio já está associado a outra empresa no Aggenda." };
    return { error: error instanceof Error && /domínio|endereço/.test(error.message) ? error.message : "Não foi possível concluir a configuração. Tente novamente." };
  }
}
