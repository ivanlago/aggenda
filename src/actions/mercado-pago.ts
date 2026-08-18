"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { createFinancialCharge } from "@/actions/payment-charges";
import { db } from "@/db";
import { clients, financialEntries, organizationFinancialIntegrations, paymentChargeEvents, paymentCharges } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { encryptFinancialCredential } from "@/lib/financial-secret";
import { getMercadoPagoCredential, mercadoPagoRequest } from "@/lib/mercado-pago";
import { createPagBankCharge } from "@/actions/pagbank";
import { createEfiCharge } from "@/actions/efi";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
const refresh = () => { revalidatePath("/financeiro/cobrancas"); revalidatePath("/financeiro"); };
type MpUser = { id: number; nickname?: string; email?: string; site_id?: string };
type MpPreference = { id: string; init_point?: string; sandbox_init_point?: string };

export async function connectMercadoPagoAccount(data: FormData) {
  const { session, organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "integrations.manage");
  const accessToken = text(data, "accessToken"); const webhookSecret = text(data, "webhookSecret"); const environment = text(data, "environment") === "production" ? "production" : "sandbox";
  if (accessToken.length < 30) return { error: "Informe um Access Token válido do Mercado Pago." };
  let user: MpUser; try { user = await mercadoPagoRequest<MpUser>("/users/me", accessToken); } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível validar a conta Mercado Pago." }; }
  const metadata = { accountId: user.id, accountName: user.nickname ?? user.email ?? `Conta ${user.id}`, siteId: user.site_id ?? "MLB", webhookStatus: webhookSecret ? "configured" : "pending", testedAt: new Date().toISOString(), billingOwner: "client" };
  const encryptedCredential = encryptFinancialCredential(JSON.stringify({ accessToken, webhookSecret: webhookSecret || undefined }));
  await db.insert(organizationFinancialIntegrations).values({ organizationId: organization.id, provider: "mercado_pago", environment, encryptedCredential, status: "active", metadata }).onConflictDoUpdate({ target: [organizationFinancialIntegrations.organizationId, organizationFinancialIntegrations.provider], set: { environment, encryptedCredential, status: "active", metadata, updatedAt: new Date() } });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "connect_and_test", entityType: "financial_integration:mercado_pago", details: { environment, accountId: user.id } }); refresh();
}

export async function testMercadoPagoIntegration() {
  const { session, organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "integrations.manage");
  try { const credential = await getMercadoPagoCredential(organization.id); const user = await mercadoPagoRequest<MpUser>("/users/me", credential.accessToken); const [integration] = await db.select().from(organizationFinancialIntegrations).where(and(eq(organizationFinancialIntegrations.organizationId, organization.id), eq(organizationFinancialIntegrations.provider, "mercado_pago"))).limit(1); await db.update(organizationFinancialIntegrations).set({ metadata: { ...(integration.metadata ?? {}), accountId: user.id, accountName: user.nickname ?? user.email, testedAt: new Date().toISOString() }, updatedAt: new Date() }).where(eq(organizationFinancialIntegrations.id, integration.id)); await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "test", entityType: "financial_integration:mercado_pago" }); refresh(); } catch (error) { return { error: error instanceof Error ? error.message : "Falha ao testar Mercado Pago." }; }
}

export async function disconnectMercadoPagoAccount() {
  const { session, organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "integrations.manage");
  await db.update(organizationFinancialIntegrations).set({ status: "disconnected", updatedAt: new Date() }).where(and(eq(organizationFinancialIntegrations.organizationId, organization.id), eq(organizationFinancialIntegrations.provider, "mercado_pago")));
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "disconnect", entityType: "financial_integration:mercado_pago" }); refresh();
}

async function createMercadoPagoCharge(data: FormData) {
  const { session, organization } = await requireOrganization(); assertOrganizationPermission(organization.role, "finance.manage");
  const financialEntryId = text(data, "financialEntryId"); const customerName = text(data, "customerName"); const customerEmail = text(data, "customerEmail");
  const [entry] = await db.select({ id: financialEntries.id, description: financialEntries.description, amountInCents: financialEntries.amountInCents, dueDate: financialEntries.dueDate, clientId: financialEntries.clientId, clientEmail: clients.email, clientPhone: clients.phone }).from(financialEntries).leftJoin(clients, eq(clients.id, financialEntries.clientId)).where(and(eq(financialEntries.id, financialEntryId), eq(financialEntries.organizationId, organization.id), eq(financialEntries.type, "receivable"), eq(financialEntries.status, "pending"))).limit(1);
  if (!entry || customerName.length < 2) return { error: "Selecione uma conta a receber e informe o pagador." };
  const [active] = await db.select({ id: paymentCharges.id }).from(paymentCharges).where(and(eq(paymentCharges.financialEntryId, entry.id), eq(paymentCharges.status, "pending"))).orderBy(desc(paymentCharges.createdAt)).limit(1); if (active) return { error: "Este lançamento já possui um pagamento pendente." };
  const credential = await getMercadoPagoCredential(organization.id); const chargeId = crypto.randomUUID();
  let preference: MpPreference; try { preference = await mercadoPagoRequest<MpPreference>("/checkout/preferences", credential.accessToken, { method: "POST", idempotencyKey: chargeId, body: { items: [{ id: entry.id, title: entry.description.slice(0, 120), quantity: 1, currency_id: "BRL", unit_price: entry.amountInCents / 100 }], payer: { name: customerName, email: customerEmail || entry.clientEmail || undefined }, external_reference: `charge:${chargeId}`, notification_url: `${appUrl()}/api/webhooks/mercado-pago?organizationId=${organization.id}`, back_urls: { success: `${appUrl()}/financeiro/cobrancas`, pending: `${appUrl()}/financeiro/cobrancas`, failure: `${appUrl()}/financeiro/cobrancas` }, auto_return: "approved", expires: true, expiration_date_to: `${entry.dueDate}T23:59:59.000-03:00` } }); } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível criar o checkout Mercado Pago." }; }
  const invoiceUrl = credential.environment === "production" ? preference.init_point : preference.sandbox_init_point ?? preference.init_point;
  await db.transaction(async (tx) => { await tx.insert(paymentCharges).values({ id: chargeId, organizationId: organization.id, provider: "mercado_pago", providerPaymentId: preference.id, originType: entry.clientId ? "client" : "financial", originId: entry.clientId ?? entry.id, financialEntryId: entry.id, clientId: entry.clientId, paymentMethod: "link", status: "pending", amountInCents: entry.amountInCents, description: entry.description, customerName, customerEmail: customerEmail || entry.clientEmail, customerPhone: text(data, "customerPhone") || entry.clientPhone, customerDocument: text(data, "customerDocument") || null, dueDate: entry.dueDate, invoiceUrl, createdByUserId: session.user.id, metadata: { preferenceId: preference.id } }); await tx.insert(paymentChargeEvents).values({ organizationId: organization.id, chargeId, eventType: "mercado_pago_preference_created", status: "pending", payload: { preferenceId: preference.id } }); });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "create", entityType: "payment_charge:mercado_pago", entityId: chargeId }); refresh();
}

export async function createProviderCharge(data: FormData) {
  const provider = text(data, "provider");
  if (provider === "mercado_pago") return createMercadoPagoCharge(data);
  if (provider === "pagbank") return createPagBankCharge(data);
  if (provider === "efi") return createEfiCharge(data);
  return createFinancialCharge(data);
}
