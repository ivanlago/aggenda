"use server";

import { and, eq, gte, isNull, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { appointments, auditLogs, bankImportTransactions, cashClosings, commissionEntries, commissionRules, financialEntries, fiscalDocuments, organizationFinancialIntegrations } from "@/db/schema";
import { organizationDate } from "@/lib/appointment-safety";
import { writeAuditLog } from "@/lib/audit";
import { encryptFinancialCredential } from "@/lib/financial-secret";
import { nfseVault, openNfseCertificate } from "@/lib/nfse/vault";
import { readFiscalCertificate } from "@/lib/nfse/certificate";
import { governmentTransport } from "@/lib/nfse/government";
import { checkGovernmentNfseCompatibility, readNfseProfile, selectNfseRoute, type NfseCertificateSecret, type NfseFiscalProfile } from "@/lib/nfse-routing";
import { nfsePublicOffer } from "@/lib/service-plans";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const cents = (data: FormData, key: string) => { const raw = value(data, key).replace(/\./g, "").replace(",", "."); const number = Number(raw); if (!Number.isFinite(number) || number < 0) throw new Error("Informe um valor válido."); return Math.round(number * 100); };

export async function createCommissionRule(data: FormData) {
  const { organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "finance.manage"); const professionalId = value(data, "professionalId") || null; const serviceId = value(data, "serviceId") || null; const calculationType = value(data, "calculationType"); const raw = Number(value(data, "value").replace(",", "."));
  if (!professionalId || !["percentage", "fixed"].includes(calculationType) || !Number.isFinite(raw) || raw < 0) throw new Error("Informe profissional, cálculo e valor.");
  await db.insert(commissionRules).values({ organizationId: organization.id, professionalId, serviceId, calculationType, value: calculationType === "percentage" ? Math.round(raw * 100) : Math.round(raw * 100) }); revalidatePath("/financeiro/comissoes");
}

export async function generateCommissions(data: FormData) {
  const { session, organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "finance.manage"); const competence = value(data, "competence"); if (!/^\d{4}-\d{2}$/.test(competence)) throw new Error("Competência inválida."); const [year, month] = competence.split("-").map(Number); const start = new Date(Date.UTC(year, month - 1, 1)); const end = new Date(Date.UTC(year, month, 1));
  const [rules, items] = await Promise.all([db.select().from(commissionRules).where(and(eq(commissionRules.organizationId, organization.id), eq(commissionRules.isActive, true))), db.select({ id: appointments.id, professionalId: appointments.professionalId, serviceId: appointments.serviceId, amount: appointments.priceInCents }).from(appointments).where(and(eq(appointments.organizationId, organization.id), eq(appointments.status, "completed"), gte(appointments.startsAt, start), lt(appointments.startsAt, end)))]);
  let generated = 0; for (const item of items) { if (!item.professionalId || !item.amount) continue; const rule = rules.filter((candidate) => candidate.professionalId === item.professionalId && (!candidate.serviceId || candidate.serviceId === item.serviceId)).sort((a, b) => Number(Boolean(b.serviceId)) - Number(Boolean(a.serviceId)))[0]; if (!rule) continue; const amount = rule.calculationType === "percentage" ? Math.round(item.amount * rule.value / 10000) : rule.value; const inserted = await db.insert(commissionEntries).values({ organizationId: organization.id, ruleId: rule.id, professionalId: item.professionalId, appointmentId: item.id, baseAmountInCents: item.amount, amountInCents: amount, competence }).onConflictDoNothing().returning({ id: commissionEntries.id }); generated += inserted.length; }
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "generate", entityType: "commission_entries", details: { competence, generated } }); revalidatePath("/financeiro/comissoes");
}

export async function markCommissionPaid(data: FormData) { const { organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "finance.manage"); const id = value(data, "id"); await db.update(commissionEntries).set({ status: "paid", paidAt: new Date(), updatedAt: new Date() }).where(and(eq(commissionEntries.id, id), eq(commissionEntries.organizationId, organization.id))); revalidatePath("/financeiro/comissoes"); }

export async function openCash(data: FormData) { const { session, organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "finance.manage"); const accountId = value(data, "accountId"); const open = await db.select({ id: cashClosings.id }).from(cashClosings).where(and(eq(cashClosings.organizationId, organization.id), eq(cashClosings.accountId, accountId), isNull(cashClosings.closedAt))).limit(1); if (open.length) throw new Error("Esta conta já possui caixa aberto."); await db.insert(cashClosings).values({ organizationId: organization.id, accountId, openedByUserId: session.user.id, openingBalanceInCents: cents(data, "openingBalance") }); revalidatePath("/financeiro/fechamento-caixa"); }

export async function closeCash(data: FormData) { const { session, organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "finance.manage"); const id = value(data, "id"); const [cash] = await db.select().from(cashClosings).where(and(eq(cashClosings.id, id), eq(cashClosings.organizationId, organization.id), isNull(cashClosings.closedAt))).limit(1); if (!cash) throw new Error("Caixa aberto não encontrado."); const today = organizationDate(new Date(), organization.timezone); const movements = await db.select().from(financialEntries).where(and(eq(financialEntries.organizationId, organization.id), eq(financialEntries.accountId, cash.accountId), eq(financialEntries.realizedDate, today))); const expected = cash.openingBalanceInCents + movements.reduce((sum, item) => sum + (item.type === "receivable" && item.status === "received" ? item.amountInCents : item.type === "payable" && item.status === "paid" ? -item.amountInCents : 0), 0); const counted = cents(data, "countedBalance"); await db.update(cashClosings).set({ closedByUserId: session.user.id, closedAt: new Date(), expectedBalanceInCents: expected, countedBalanceInCents: counted, differenceInCents: counted - expected, notes: value(data, "notes") || null }).where(eq(cashClosings.id, id)); revalidatePath("/financeiro/fechamento-caixa"); }

export async function importOfx(data: FormData) { const { organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "finance.manage"); const accountId = value(data, "accountId"); const file = data.get("file"); if (!(file instanceof File) || file.size > 5_000_000) throw new Error("Selecione um OFX de até 5 MB."); const content = await file.text(); const blocks = content.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? []; if (!blocks.length) throw new Error("Nenhuma transação encontrada no arquivo OFX."); for (const block of blocks) { const field = (name: string) => block.match(new RegExp(`<${name}>([^<\\r\\n]+)`, "i"))?.[1]?.trim() ?? ""; const externalId = field("FITID") || `${field("DTPOSTED")}-${field("TRNAMT")}-${field("MEMO")}`; const date = field("DTPOSTED").slice(0, 8).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"); const amount = Math.round(Number(field("TRNAMT")) * 100); if (!date || !Number.isFinite(amount)) continue; await db.insert(bankImportTransactions).values({ organizationId: organization.id, accountId, externalId, occurredOn: date, description: field("MEMO") || field("NAME") || "Movimentação bancária", amountInCents: amount }).onConflictDoNothing(); } revalidatePath("/financeiro/conciliacao-ofx"); }

export async function reconcileOfx(data: FormData) { const { organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "finance.manage"); const transactionId = value(data, "transactionId"); const entryId = value(data, "entryId"); const [entry] = await db.select({ id: financialEntries.id }).from(financialEntries).where(and(eq(financialEntries.id, entryId), eq(financialEntries.organizationId, organization.id))).limit(1); if (!entry) throw new Error("Lançamento inválido."); await db.update(bankImportTransactions).set({ financialEntryId: entryId, status: "matched" }).where(and(eq(bankImportTransactions.id, transactionId), eq(bankImportTransactions.organizationId, organization.id))); revalidatePath("/financeiro/conciliacao-ofx"); }

export async function requestNfseActivation(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "integrations.manage");
  if (data.get("acceptNfseOffer") !== "on") throw new Error("Aceite as condições comerciais da NFS-e.");
  const setupMode = value(data, "setupMode") === "assisted" ? "assisted" : "self_service";
  const [existing] = await db.select({ status: organizationFinancialIntegrations.status }).from(organizationFinancialIntegrations).where(and(eq(organizationFinancialIntegrations.organizationId, organization.id), eq(organizationFinancialIntegrations.provider, "nfse"))).limit(1);
  if (existing?.status === "configured" || existing?.status === "active") throw new Error("A emissão de NFS-e já está configurada.");
  const commercialAcceptance = { monthlyPriceInCents: nfsePublicOffer.monthlyPriceInCents, monthlyLimit: nfsePublicOffer.monthlyLimit, overageInCents: nfsePublicOffer.overageInCents, assistedSetupInCents: setupMode === "assisted" ? nfsePublicOffer.assistedSetupInCents : 0, setupMode, acceptedAt: new Date().toISOString(), acceptedByUserId: session.user.id };
  await db.insert(organizationFinancialIntegrations).values({ organizationId: organization.id, provider: "nfse", environment: "sandbox", encryptedCredential: encryptFinancialCredential("activation-requested"), status: "requested", metadata: { billingOwner: "client", costsPaidBy: "client", requestedAt: new Date().toISOString(), requestedByUserId: session.user.id, commercialAcceptance } }).onConflictDoUpdate({ target: [organizationFinancialIntegrations.organizationId, organizationFinancialIntegrations.provider], set: { status: "requested", metadata: { billingOwner: "client", costsPaidBy: "client", requestedAt: new Date().toISOString(), requestedByUserId: session.user.id, commercialAcceptance }, updatedAt: new Date() } });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "request_activation", entityType: "financial_integration:nfse", details: commercialAcceptance });
  revalidatePath("/financeiro/nfse");
}

function digits(data: FormData, key: string) { return value(data, key).replace(/\D/g, ""); }

export async function saveNfseFiscalProfile(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "integrations.manage");
  const cnpj = digits(data, "cnpj");
  const municipalRegistration = value(data, "municipalRegistration");
  const municipalityCode = digits(data, "municipalityCode");
  const dpsSeries = digits(data, "dpsSeries");
  if (!/^[1-9]\d{0,4}$/.test(dpsSeries) || Number(dpsSeries) > 49999) return { error: "Escolha uma série entre 1 e 49999 e confirme que ela não é usada por outro emissor da clínica." };
  const taxRegime = value(data, "taxRegime") as NfseFiscalProfile["taxRegime"];
  const certificate = data.get("certificate");
  const certificatePassword = String(data.get("certificatePassword") ?? "");
  if (data.get("authorizeCertificate") !== "on") return { error: "Autorize a custódia e o uso do A1 para as operações fiscais desta clínica." };
  if (value(data, "environment") === "production") throw new Error("Produção aguarda homologação fiscal do Aggenda. Configure o ambiente de testes.");
  if (cnpj.length !== 14) throw new Error("Informe um CNPJ válido.");
  if (!municipalRegistration) throw new Error("Informe a inscrição municipal.");
  if (municipalityCode.length !== 7) throw new Error("Informe o código IBGE do município com 7 dígitos.");
  if (!["simples_nacional", "lucro_presumido", "lucro_real", "mei"].includes(taxRegime)) throw new Error("Regime tributário inválido.");
  if (!(certificate instanceof File) || !certificate.size || certificate.size > 5_000_000 || !/\.(pfx|p12)$/i.test(certificate.name)) throw new Error("Envie um certificado A1 .pfx ou .p12 de até 5 MB.");
  if (!certificatePassword) throw new Error("Informe a senha do certificado A1.");
  const secret: NfseCertificateSecret = { pfxBase64: Buffer.from(await certificate.arrayBuffer()).toString("base64"), password: certificatePassword, fileName: certificate.name };
  let validatedCertificate: ReturnType<typeof readFiscalCertificate>;
  try { validatedCertificate = readFiscalCertificate(secret, cnpj); }
  catch (error) { return { error: error instanceof Error && /A1|certificado|arquivo|chave|CNPJ/.test(error.message) ? error.message : "Não foi possível validar o certificado. Confira o A1 e sua senha." }; }
  const profile: NfseFiscalProfile = { cnpj, municipalRegistration, municipalityCode, taxRegime, routingMode: "pending_analysis", compatibilityStatus: "not_checked", partnerFallbackAuthorized: data.get("partnerFallbackAuthorized") === "on" };
  profile.certificateExpiresAt = validatedCertificate.expiresAt;
  profile.certificateFingerprint = validatedCertificate.fingerprint;
  profile.dpsSeries = dpsSeries;
  const [currentIntegration] = await db.select({ metadata: organizationFinancialIntegrations.metadata }).from(organizationFinancialIntegrations).where(and(eq(organizationFinancialIntegrations.organizationId, organization.id), eq(organizationFinancialIntegrations.provider, "nfse"))).limit(1);
  const metadata = { ...(currentIntegration?.metadata ?? {}), billingOwner: "client", costsPaidBy: "client", fiscalProfile: profile, certificateConsent: { authorizedAt: new Date().toISOString(), authorizedByUserId: session.user.id, revokedAt: null } };
  const encryptedCredential = nfseVault().encrypt(organization.id, "certificate", JSON.stringify(secret));
  await db.transaction(async (tx) => {
    await tx.insert(organizationFinancialIntegrations).values({ organizationId: organization.id, provider: "nfse", environment: "sandbox", encryptedCredential, status: "configured", metadata }).onConflictDoUpdate({ target: [organizationFinancialIntegrations.organizationId, organizationFinancialIntegrations.provider], set: { environment: "sandbox", encryptedCredential, status: "configured", metadata, updatedAt: new Date() } });
    await tx.insert(auditLogs).values({ organizationId: organization.id, userId: session.user.id, action: "configure_fiscal_profile", entityType: "financial_integration:nfse", details: { municipalityCode, taxRegime, environment: "sandbox", certificateFingerprint: validatedCertificate.fingerprint } });
  });
  revalidatePath("/financeiro/nfse");
}

export async function diagnoseNfseCompatibility() {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "integrations.manage");
  const [integration] = await db.select().from(organizationFinancialIntegrations).where(and(eq(organizationFinancialIntegrations.organizationId, organization.id), eq(organizationFinancialIntegrations.provider, "nfse"))).limit(1);
  const profile = readNfseProfile(integration?.metadata);
  if (!integration || !profile) throw new Error("Conclua o cadastro fiscal antes do diagnóstico.");
  if (integration.status === "revoked") return { error: "O uso do certificado foi revogado. Cadastre um A1 autorizado para continuar." };
  const secret = JSON.parse(openNfseCertificate(organization.id, integration.encryptedCredential)) as NfseCertificateSecret;
  readFiscalCertificate(secret, profile.cnpj);
  const result = await checkGovernmentNfseCompatibility(profile.municipalityCode, governmentTransport(secret, integration.environment === "production" ? "production" : "sandbox"));
  const updatedProfile: NfseFiscalProfile = { ...profile, compatibilityStatus: result.status, compatibilityMessage: result.message, compatibilityCheckedAt: new Date().toISOString(), routingMode: selectNfseRoute(result.status, profile.partnerFallbackAuthorized) };
  await db.update(organizationFinancialIntegrations).set({ status: "configured", metadata: { ...(integration.metadata ?? {}), fiscalProfile: updatedProfile }, updatedAt: new Date() }).where(eq(organizationFinancialIntegrations.id, integration.id));
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "diagnose_compatibility", entityType: "financial_integration:nfse", details: { municipalityCode: profile.municipalityCode, result: result.status, route: updatedProfile.routingMode } });
  revalidatePath("/financeiro/nfse");
}

export async function saveClientFinancialIntegration(data: FormData) { const { session, organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "integrations.manage"); const provider = value(data, "provider"); const credential = value(data, "credential"); if (provider !== "asaas" || credential.length < 8) throw new Error("Integração financeira inválida."); const encryptedCredential = encryptFinancialCredential(credential); await db.insert(organizationFinancialIntegrations).values({ organizationId: organization.id, provider, environment: value(data, "environment") || "sandbox", encryptedCredential, metadata: { billingOwner: "client", costsPaidBy: "client" } }).onConflictDoUpdate({ target: [organizationFinancialIntegrations.organizationId, organizationFinancialIntegrations.provider], set: { encryptedCredential, environment: value(data, "environment") || "sandbox", status: "configured", metadata: { billingOwner: "client", costsPaidBy: "client" }, updatedAt: new Date() } }); await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "configure", entityType: `financial_integration:${provider}` }); revalidatePath("/financeiro/cobrancas"); }

export async function registerFiscalDocument(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.manage");
  const entryId = value(data, "financialEntryId");
  const number = value(data, "number");
  const amount = cents(data, "amount");
  const verificationUrl = value(data, "verificationUrl");
  if (!number || number.length > 60 || amount <= 0) return { error: "Informe o número e o valor da nota já emitida." };
  if (verificationUrl) {
    try { if (new URL(verificationUrl).protocol !== "https:") return { error: "Informe um endereço HTTPS para verificação." }; }
    catch { return { error: "Endereço de verificação inválido." }; }
  }
  await db.transaction(async (tx) => {
    if (entryId) {
      const [entry] = await tx.select({ id: financialEntries.id }).from(financialEntries).where(and(eq(financialEntries.id, entryId), eq(financialEntries.organizationId, organization.id))).for("update");
      if (!entry) throw new Error("Recebimento não encontrado nesta clínica.");
      const [existing] = await tx.select({ id: fiscalDocuments.id }).from(fiscalDocuments).where(and(eq(fiscalDocuments.organizationId, organization.id), eq(fiscalDocuments.financialEntryId, entryId), eq(fiscalDocuments.status, "issued"))).limit(1);
      if (existing) throw new Error("Este recebimento já possui uma nota registrada.");
    }
    await tx.insert(fiscalDocuments).values({ organizationId: organization.id, financialEntryId: entryId || null, provider: "manual", number, status: "issued", amountInCents: amount, issuedAt: new Date(), verificationUrl: verificationUrl || null });
  });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "register_external", entityType: "fiscal_document" });
  revalidatePath("/financeiro/nfse");
}
