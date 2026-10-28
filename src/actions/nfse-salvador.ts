"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { organizationFinancialIntegrations } from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { assertOrganizationPermission } from "@/lib/permissions";
import { readNfseProfile, type NfseCertificateSecret } from "@/lib/nfse-routing";
import { readFiscalCertificate } from "@/lib/nfse/certificate";
import { openNfseCertificate } from "@/lib/nfse/vault";
import { SalvadorNfseService } from "@/lib/nfse/salvador/service";
import { readSalvadorSandboxContract, salvadorSandboxTransport } from "@/lib/nfse/salvador/transport";
import { assertSalvadorIssuer, salvadorDraftSchema, signSalvadorBatch } from "@/lib/nfse/salvador/xml";

async function context(needsTransport: boolean) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.manage");
  const [integration] = await db.select().from(organizationFinancialIntegrations).where(and(eq(organizationFinancialIntegrations.organizationId, organization.id), eq(organizationFinancialIntegrations.provider, "nfse"))).limit(1);
  const profile = readNfseProfile(integration?.metadata);
  if (!integration || !profile) throw new Error("Cadastre o perfil fiscal de Salvador e o A1 autorizado.");
  assertSalvadorIssuer(profile);
  const consent = integration.metadata?.certificateConsent as { authorizedAt?: string; revokedAt?: string | null } | undefined;
  if (integration.status !== "configured" || integration.environment !== "sandbox" || !consent?.authorizedAt || consent.revokedAt) throw new Error("Conclua o cadastro de homologação e autorize o uso do A1.");
  const secret = JSON.parse(openNfseCertificate(organization.id, integration.encryptedCredential)) as NfseCertificateSecret;
  const certificate = readFiscalCertificate(secret, profile.cnpj);
  const contract = readSalvadorSandboxContract();
  if (needsTransport && !contract) throw new Error("Transmissão municipal bloqueada: confira o WSDL e a aceitação do leiaute antes de habilitar o ambiente de homologação.");
  const transport = contract ? salvadorSandboxTransport(secret, contract, "sandbox") : async () => { throw new Error("Homologação municipal não habilitada."); };
  return { session, organization, profile, certificate, service: new SalvadorNfseService(db, transport, session.user.id) };
}

export async function saveSalvadorDraft(data: FormData) {
  const ctx = await context(false);
  if (data.get("confirmSalvadorScenario") !== "on") return { error: "Confirme o cenário restrito de homologação municipal com o contador." };
  const field = (name: string) => String(data.get(name) ?? "").trim();
  const digits = (name: string) => field(name).replace(/\D/g, "");
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(field("amount")) || !/^\d{1,2}(?:[.,]\d{1,2})?$/.test(field("issRate"))) return { error: "Informe valor e alíquota com no máximo duas casas decimais." };
  const parsed = salvadorDraftSchema.safeParse({ channel: "salvador", rpsNumber: field("rpsNumber"), rpsSeries: field("rpsSeries"), issuedAt: `${field("issuedAt")}:00-03:00`, payerDocument: digits("payerDocument"), payerName: field("payerName"), address: { street: field("street"), number: field("addressNumber"), district: field("district"), municipalityCode: field("payerMunicipality"), state: field("state").toUpperCase(), zip: digits("zip") }, description: field("description"), itemList: field("itemList"), cnae: digits("cnae"), nbs: field("nbs"), taxClassification: field("taxClassification"), operationIndicator: field("operationIndicator"), amountInCents: Math.round(Number(field("amount").replace(/\./g, "").replace(",", ".")) * 100), issRateBasisPoints: Math.round(Number(field("issRate").replace(",", ".")) * 100), scenario: "presumido_local_sem_retencoes" });
  if (!parsed.success) return { error: "Confira identificação do RPS, data, pagador, endereço, serviço, valor e alíquota de ISS entre 2% e 5%." };
  const row = await ctx.service.draft(ctx.organization.id, field("financialEntryId"), ctx.profile, "sandbox", parsed.data);
  revalidatePath("/financeiro/nfse");
  if (row.status !== "draft") return { warning: "O recebimento já possui solicitação enviada. Consulte o mesmo RPS." };
}
export async function submitSalvadorNfse(data: FormData) {
  const ctx = await context(true);
  if (data.get("confirmIssue") !== "on") return { error: "Confirme a emissão municipal exclusivamente em homologação." };
  await ctx.service.submit(ctx.organization.id, String(data.get("id") ?? ""), ctx.profile, (xml) => signSalvadorBatch(xml, ctx.certificate.privateKeyPem, ctx.certificate.certificatePem));
  revalidatePath("/financeiro/nfse");
}
export async function consultSalvadorNfse(data: FormData) {
  const ctx = await context(true);
  const id = String(data.get("id") ?? "");
  const row = await ctx.service.get(ctx.organization.id, id);
  if (row.cnpj !== ctx.profile.cnpj) return { error: "Use o certificado do cadastro original desta nota." };
  await ctx.service.reconcile(ctx.organization.id, id);
  revalidatePath("/financeiro/nfse");
}
