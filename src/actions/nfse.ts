"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { auditLogs, organizationFinancialIntegrations } from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { assertOrganizationPermission } from "@/lib/permissions";
import { openNfseCertificate } from "@/lib/nfse/vault";
import { readNfseProfile, type NfseCertificateSecret } from "@/lib/nfse-routing";
import { readFiscalCertificate } from "@/lib/nfse/certificate";
import { governmentTransport } from "@/lib/nfse/government";
import { NfseService } from "@/lib/nfse/service";
import { signFiscalXml } from "@/lib/nfse/xml";
import { fiscalChannelFor, ibsCbsSchema, readNationalTaxForm } from "@/lib/nfse/tax-regimes";

async function context() {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.manage");
  const [integration] = await db.select().from(organizationFinancialIntegrations).where(and(eq(organizationFinancialIntegrations.organizationId, organization.id), eq(organizationFinancialIntegrations.provider, "nfse"))).limit(1);
  const profile = readNfseProfile(integration?.metadata);
  if (!integration || !profile) throw new Error("Conclua o cadastro fiscal.");
  if (fiscalChannelFor(profile.municipalityCode, profile.taxRegime) !== "national") throw new Error("Este município e regime exigem o canal municipal de RPS. Confira a integração e a vigência antes de emitir.");
  if (integration.status === "revoked") throw new Error("O uso do certificado foi revogado. Cadastre um A1 autorizado para continuar.");
  const consent = integration.metadata?.certificateConsent as { authorizedAt?: string; revokedAt?: string | null } | undefined;
  if (!consent?.authorizedAt || consent.revokedAt) throw new Error("Atualize o cadastro fiscal e autorize o uso do certificado antes de emitir.");
  if (integration.environment !== "sandbox") throw new Error("A emissão em produção aguarda homologação fiscal do Aggenda.");
  const secret = JSON.parse(openNfseCertificate(organization.id, integration.encryptedCredential)) as NfseCertificateSecret;
  const certificate = readFiscalCertificate(secret, profile.cnpj);
  return { session, organization, profile, certificate, service: new NfseService(db, governmentTransport(secret, "sandbox"), session.user.id) };
}

export async function saveNfseDraft(data: FormData) {
  const ctx = await context();
  const field = (key: string) => String(data.get(key) ?? "").trim();
  if (data.get("fiscalScenarioConfirmed") !== "on") return { error: "Confirme o enquadramento fiscal e a ausência de retenções, benefícios ou regime especial com seu contador." };
  const tax = readNationalTaxForm(data, ctx.profile.taxRegime);
  const hasIbs = ["ibsCst", "ibsClassification", "ibsOperation", "ibsFinalConsumer"].some((key) => field(key));
  const ibsCbs = hasIbs ? ibsCbsSchema.parse({ cst: field("ibsCst"), classification: field("ibsClassification"), operationIndicator: field("ibsOperation"), finalConsumer: field("ibsFinalConsumer") }) : undefined;
  const row = await ctx.service.draft(ctx.organization.id, field("financialEntryId"), ctx.profile, "sandbox", {
    payerDocument: field("payerDocument").replace(/\D/g, ""), payerName: field("payerName"), description: field("description"),
    serviceCode: field("serviceCode"), municipalServiceCode: field("municipalServiceCode") || undefined, nbs: field("nbs") || undefined,
    competence: field("competence"), amountInCents: Math.round(Number(field("amount").replace(/\./g, "").replace(",", ".")) * 100),
    tax, ibsCbs,
    address: { street: field("street"), number: field("addressNumber"), district: field("district"), municipalityCode: field("payerMunicipality"), zip: field("zip").replace(/\D/g, "") },
  });
  revalidatePath("/financeiro/nfse");
  if (row.status !== "draft") return { warning: "Já existe uma solicitação para este recebimento. Consulte seu status na lista." };
}

export async function submitNfse(data: FormData) {
  const ctx = await context();
  if (data.get("confirmIssue") !== "on") return { error: "Revise o rascunho e confirme a emissão em homologação." };
  const id = String(data.get("id") ?? "");
  const request = await ctx.service.get(ctx.organization.id, id);
  if (request.cnpj !== ctx.profile.cnpj || request.environment !== "sandbox") return { error: "A solicitação pertence a outro cadastro fiscal ou ambiente." };
  await ctx.service.submit(ctx.organization.id, id, ctx.profile, (xml) => signFiscalXml(xml, "infDPS", ctx.certificate.privateKeyPem, ctx.certificate.certificatePem));
  revalidatePath("/financeiro/nfse");
}

export async function consultNfse(data: FormData) {
  const ctx = await context();
  const id = String(data.get("id") ?? "");
  const row = await ctx.service.get(ctx.organization.id, id);
  if (row.cnpj !== ctx.profile.cnpj || row.environment !== "sandbox") return { error: "Use o cadastro fiscal original da solicitação para consultar." };
  await ctx.service.reconcile(ctx.organization.id, id);
  revalidatePath("/financeiro/nfse");
}

export async function cancelNfse(data: FormData) {
  const ctx = await context();
  if (data.get("confirmCancellation") !== "on") return { error: "Confirme o pedido de cancelamento da nota de teste." };
  await ctx.service.cancel(ctx.organization.id, String(data.get("id") ?? ""), ctx.profile, String(data.get("reason") ?? ""), String(data.get("reasonCode") ?? ""),
    (xml) => signFiscalXml(xml, "infPedReg", ctx.certificate.privateKeyPem, ctx.certificate.certificatePem));
  revalidatePath("/financeiro/nfse");
}

export async function revokeNfseCertificate(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "integrations.manage");
  if (data.get("confirmRevocation") !== "on") return { error: "Confirme a remoção do A1 e a interrupção de novas operações fiscais." };
  await db.transaction(async (tx) => {
    const [integration] = await tx.select().from(organizationFinancialIntegrations).where(and(eq(organizationFinancialIntegrations.organizationId, organization.id), eq(organizationFinancialIntegrations.provider, "nfse"))).for("update");
    if (!integration) throw new Error("Cadastro fiscal não encontrado.");
    await tx.update(organizationFinancialIntegrations).set({ encryptedCredential: "revoked", status: "revoked", metadata: { ...(integration.metadata ?? {}), certificateConsent: { revokedAt: new Date().toISOString(), revokedByUserId: session.user.id } }, updatedAt: new Date() }).where(eq(organizationFinancialIntegrations.id, integration.id));
    await tx.insert(auditLogs).values({ organizationId: organization.id, userId: session.user.id, entityType: "financial_integration:nfse", action: "revoke_certificate" });
  });
  revalidatePath("/financeiro/nfse");
}
