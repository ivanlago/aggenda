"use server";

import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { clients, financialEntries, organizationFinancialIntegrations, paymentChargeEvents, paymentCharges } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { efiRequest, getEfiCredential, type EfiCredential } from "@/lib/efi";
import { encryptFinancialCredential } from "@/lib/financial-secret";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const digits = (value: string) => value.replace(/\D/g, "");
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
const refresh = () => { revalidatePath("/financeiro/cobrancas"); revalidatePath("/financeiro"); };
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message.slice(0, 500) : fallback;
type Cob = { txid: string; loc?: { id?: number; location?: string }; status?: string };
type QrCode = { qrcode?: string; imagemQrcode?: string; linkVisualizacao?: string };

export async function connectEfiAccount(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "integrations.manage");
  const clientId = text(data, "clientId"); const clientSecret = text(data, "clientSecret"); const pixKey = text(data, "pixKey"); const certificatePassword = text(data, "certificatePassword");
  const environment = text(data, "environment") === "production" ? "production" : "sandbox";
  const certificate = data.get("certificate");
  if (clientId.length < 10 || clientSecret.length < 10 || pixKey.length < 3 || !(certificate instanceof File) || !certificate.size) return { error: "Informe Client ID, Client Secret, chave Pix e certificado .p12." };
  if (certificate.size > 128 * 1024) return { error: "O certificado deve ter no máximo 128 KB." };
  const webhookHmac = randomBytes(32).toString("base64url");
  const credential: EfiCredential = { clientId, clientSecret, pixKey, certificatePassword: certificatePassword || undefined, certificateBase64: Buffer.from(await certificate.arrayBuffer()).toString("base64"), webhookHmac, environment };
  try { await efiRequest<Cob[]>("/v2/cob?inicio=2020-01-01T00:00:00Z&fim=2020-01-01T00:01:00Z", credential); }
  catch (error) { return { error: message(error, "Não foi possível validar as credenciais e o certificado Efí.") }; }
  let webhookStatus = "pending_https"; let webhookError: string | null = null;
  if (appUrl().startsWith("https://")) {
    try { await efiRequest(`/v2/webhook/${encodeURIComponent(pixKey)}`, credential, { method: "PUT", body: { webhookUrl: `${appUrl()}/api/webhooks/efi?organizationId=${organization.id}&hmac=${webhookHmac}&ignorar=` } }); webhookStatus = "active"; }
    catch (error) { webhookStatus = "error"; webhookError = message(error, "Falha ao cadastrar webhook Efí."); }
  }
  const metadata = { accountName: "Conta Efí", billingOwner: "client", webhookStatus, webhookError, testedAt: new Date().toISOString(), capabilities: ["pix"] };
  await db.insert(organizationFinancialIntegrations).values({ organizationId: organization.id, provider: "efi", environment, encryptedCredential: encryptFinancialCredential(JSON.stringify({ clientId, clientSecret, pixKey, certificatePassword: certificatePassword || undefined, certificateBase64: credential.certificateBase64, webhookHmac })), status: webhookStatus === "error" ? "attention" : "active", metadata }).onConflictDoUpdate({ target: [organizationFinancialIntegrations.organizationId, organizationFinancialIntegrations.provider], set: { environment, encryptedCredential: encryptFinancialCredential(JSON.stringify({ clientId, clientSecret, pixKey, certificatePassword: certificatePassword || undefined, certificateBase64: credential.certificateBase64, webhookHmac })), status: webhookStatus === "error" ? "attention" : "active", metadata, updatedAt: new Date() } });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "connect_and_test", entityType: "financial_integration:efi", details: { environment, webhookStatus } }); refresh();
  if (webhookError) return { error: `Conta validada, mas o webhook requer atenção: ${webhookError}` };
}

export async function testEfiIntegration() {
  const { session, organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "integrations.manage");
  try { const credential = await getEfiCredential(organization.id); await efiRequest("/v2/cob?inicio=2020-01-01T00:00:00Z&fim=2020-01-01T00:01:00Z", credential); const [integration] = await db.select().from(organizationFinancialIntegrations).where(and(eq(organizationFinancialIntegrations.organizationId, organization.id), eq(organizationFinancialIntegrations.provider, "efi"))).limit(1); await db.update(organizationFinancialIntegrations).set({ metadata: { ...(integration.metadata ?? {}), testedAt: new Date().toISOString(), lastTestStatus: "success" }, updatedAt: new Date() }).where(eq(organizationFinancialIntegrations.id, integration.id)); await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "test", entityType: "financial_integration:efi" }); refresh(); }
  catch (error) { return { error: message(error, "Falha ao testar Efí.") }; }
}

export async function disconnectEfiAccount() {
  const { session, organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "integrations.manage");
  await db.update(organizationFinancialIntegrations).set({ status: "disconnected", updatedAt: new Date() }).where(and(eq(organizationFinancialIntegrations.organizationId, organization.id), eq(organizationFinancialIntegrations.provider, "efi")));
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "disconnect", entityType: "financial_integration:efi" }); refresh();
}

export async function createEfiCharge(data: FormData) {
  const { session, organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "finance.manage");
  const financialEntryId = text(data, "financialEntryId"); const customerName = text(data, "customerName"); const customerDocument = digits(text(data, "customerDocument"));
  if (customerName.length < 2 || ![11, 14].includes(customerDocument.length)) return { error: "Informe nome e CPF/CNPJ do pagador." };
  const [entry] = await db.select({ id: financialEntries.id, description: financialEntries.description, amountInCents: financialEntries.amountInCents, dueDate: financialEntries.dueDate, clientId: financialEntries.clientId, clientEmail: clients.email, clientPhone: clients.phone }).from(financialEntries).leftJoin(clients, eq(clients.id, financialEntries.clientId)).where(and(eq(financialEntries.id, financialEntryId), eq(financialEntries.organizationId, organization.id), eq(financialEntries.type, "receivable"), eq(financialEntries.status, "pending"))).limit(1);
  if (!entry) return { error: "Selecione uma conta a receber pendente." };
  const [active] = await db.select({ id: paymentCharges.id }).from(paymentCharges).where(and(eq(paymentCharges.financialEntryId, entry.id), eq(paymentCharges.status, "pending"))).orderBy(desc(paymentCharges.createdAt)).limit(1); if (active) return { error: "Este lançamento já possui um pagamento pendente." };
  const credential = await getEfiCredential(organization.id); const chargeId = crypto.randomUUID(); const txid = chargeId.replace(/-/g, "").slice(0, 32); const expiration = Math.max(60, Math.floor((new Date(`${entry.dueDate}T23:59:59-03:00`).getTime() - Date.now()) / 1000));
  let cob: Cob; let qr: QrCode;
  try { cob = await efiRequest<Cob>(`/v2/cob/${txid}`, credential, { method: "PUT", body: { calendario: { expiracao: expiration }, devedor: customerDocument.length === 11 ? { cpf: customerDocument, nome: customerName } : { cnpj: customerDocument, nome: customerName }, valor: { original: (entry.amountInCents / 100).toFixed(2) }, chave: credential.pixKey, solicitacaoPagador: entry.description.slice(0, 140), infoAdicionais: [{ nome: "Aggenda", valor: `charge:${chargeId}` }] } }); if (!cob.loc?.id) throw new Error("A Efí não retornou a localização do QR Code."); qr = await efiRequest<QrCode>(`/v2/loc/${cob.loc.id}/qrcode`, credential); }
  catch (error) { return { error: message(error, "Não foi possível criar o Pix Efí.") }; }
  const image = qr.imagemQrcode?.replace(/^data:image\/png;base64,/, "") ?? null;
  await db.transaction(async (tx) => { await tx.insert(paymentCharges).values({ id: chargeId, organizationId: organization.id, provider: "efi", providerPaymentId: txid, originType: entry.clientId ? "client" : "financial", originId: entry.clientId ?? entry.id, financialEntryId: entry.id, clientId: entry.clientId, paymentMethod: "pix", status: "pending", amountInCents: entry.amountInCents, description: entry.description, customerName, customerDocument, customerEmail: text(data, "customerEmail") || entry.clientEmail, customerPhone: text(data, "customerPhone") || entry.clientPhone, dueDate: entry.dueDate, invoiceUrl: qr.linkVisualizacao ?? cob.loc?.location, pixQrCodePayload: qr.qrcode, pixQrCodeImage: image, metadata: { locationId: cob.loc?.id }, createdByUserId: session.user.id }); await tx.insert(paymentChargeEvents).values({ organizationId: organization.id, chargeId, eventType: "EFI_COB_CREATED", status: "pending", payload: { txid } }); });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "create", entityType: "payment_charge:efi", entityId: chargeId, details: { txid, amountInCents: entry.amountInCents } }); refresh();
}
