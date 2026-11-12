import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { financialAccounts, organizationFinancialIntegrations, paymentCharges, paymentMethods } from "@/db/schema";
import { posProviderReady } from "./pos-providers";
import { getOrganizationAsaasCredential } from "./organization-asaas";
import { organizationAsaasRequest } from "./asaas";
import { getMercadoPagoCredential, mercadoPagoRequest } from "./mercado-pago";
import { getPagBankCredential, pagBankRequest } from "./pagbank";
import { getEfiCredential, efiRequest } from "./efi";
import { ProviderRequestError } from "./provider-request-error";
import { checkoutUrlIsSafe } from "./pos-payments-policy";

export async function bookingOnlineProvider(organizationId: string) {
  const [row] = await db.select().from(organizationFinancialIntegrations).where(and(eq(organizationFinancialIntegrations.organizationId, organizationId), eq(organizationFinancialIntegrations.isDefaultPos, true))).limit(1);
  if (!row || !posProviderReady(row)) throw new Error("BOOKING_PROVIDER_NOT_CONFIGURED");
  // Validate credentials before reserving a time, without exposing them to the portal.
  if (row.provider === "asaas") await getOrganizationAsaasCredential(organizationId);
  else if (row.provider === "mercado_pago") await getMercadoPagoCredential(organizationId);
  else if (row.provider === "pagbank") await getPagBankCredential(organizationId);
  else await getEfiCredential(organizationId);
  const [method] = await db.select({ accountId: financialAccounts.id, paymentMethodId: paymentMethods.id, paymentMethodName: paymentMethods.name }).from(paymentMethods).innerJoin(financialAccounts, and(eq(financialAccounts.id, paymentMethods.defaultAccountId), eq(financialAccounts.organizationId, organizationId), eq(financialAccounts.isActive, true))).where(and(eq(paymentMethods.organizationId, organizationId), eq(paymentMethods.isActive, true), eq(paymentMethods.kind, row.provider === "efi" ? "pix" : "link"))).orderBy(paymentMethods.id).limit(1);
  if (!method) throw new Error("BOOKING_PAYMENT_ACCOUNT_NOT_CONFIGURED");
  return { ...row, ...method };
}

/** The row is persisted with the appointment first. Only one request may issue it. */
export async function issueBookingOnlinePayment(id: string, token: string) {
  const [charge] = await db.update(paymentCharges).set({ metadata: sql`coalesce(${paymentCharges.metadata}, '{}'::jsonb) || '{"issuanceState":"creating"}'::jsonb`, updatedAt: new Date() })
    .where(and(eq(paymentCharges.id, id), eq(paymentCharges.status, "payment_review"), sql`${paymentCharges.metadata}->>'issuanceState' = 'new'`)).returning();
  if (!charge) return;
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://www.aggenda.app.br").replace(/\/$/, "");
  const returnUrl = `${base}/agendamento/${token}`;
  const expiresAt = String(charge.metadata?.expiresAt);
  const reference = `charge:${charge.id}`;
  let providerPaymentId: string | undefined, invoiceUrl: string | undefined, pixQrCodePayload: string | undefined;
  try {
    const [integration] = await db.select().from(organizationFinancialIntegrations).where(and(eq(organizationFinancialIntegrations.organizationId, charge.organizationId), eq(organizationFinancialIntegrations.provider, charge.provider))).limit(1);
    if (!integration || !posProviderReady(integration) || integration.environment !== charge.metadata?.environment || (charge.provider === "mercado_pago" && String(integration.metadata?.accountId) !== String(charge.metadata?.collectorId))) throw new Error("BOOKING_PROVIDER_CHANGED");
    if (charge.provider === "asaas") {
      const credential = await getOrganizationAsaasCredential(charge.organizationId);
      const found = await organizationAsaasRequest<{ data?: { id: string }[] }>(`/customers?cpfCnpj=${charge.customerDocument}&limit=1`, credential);
      const customer = found.data?.[0]?.id ?? (await organizationAsaasRequest<{ id: string }>("/customers", credential, { method: "POST", body: { name: charge.customerName, cpfCnpj: charge.customerDocument, email: charge.customerEmail || undefined, phone: charge.customerPhone || undefined } })).id;
      const payment = await organizationAsaasRequest<{ id: string; invoiceUrl?: string }>("/payments", credential, { method: "POST", body: { customer, billingType: "UNDEFINED", value: charge.amountInCents / 100, dueDate: charge.dueDate, description: charge.description, externalReference: reference } });
      providerPaymentId = payment.id; invoiceUrl = payment.invoiceUrl;
    } else if (charge.provider === "mercado_pago") {
      const credential = await getMercadoPagoCredential(charge.organizationId);
      const checkout = await mercadoPagoRequest<{ id: string; init_point?: string; sandbox_init_point?: string }>("/checkout/preferences", credential.accessToken, { method: "POST", idempotencyKey: charge.id, body: {
        items: [{ id: charge.id, title: charge.description, quantity: 1, currency_id: "BRL", unit_price: charge.amountInCents / 100 }],
        ...(charge.customerEmail ? { payer: { email: charge.customerEmail } } : {}), external_reference: reference,
        notification_url: `${base}/api/webhooks/mercado-pago?organizationId=${charge.organizationId}`,
        back_urls: { success: returnUrl, pending: returnUrl, failure: returnUrl }, expires: true,
        expiration_date_from: new Date(Date.now() - 60000).toISOString(), expiration_date_to: expiresAt,
      } });
      providerPaymentId = checkout.id; invoiceUrl = credential.environment === "production" ? checkout.init_point : checkout.sandbox_init_point;
    } else if (charge.provider === "pagbank") {
      const credential = await getPagBankCredential(charge.organizationId);
      const webhook = `${base}/api/webhooks/pagbank?organizationId=${charge.organizationId}`;
      const checkout = await pagBankRequest<{ id: string; links?: { rel: string; href: string }[] }>("/checkouts", credential, { method: "POST", idempotencyKey: charge.id, body: {
        reference_id: reference, expiration_date: expiresAt,
        customer: { name: charge.customerName, tax_id: charge.customerDocument, email: charge.customerEmail || undefined }, customer_modifiable: true,
        items: [{ reference_id: charge.id, name: charge.description.slice(0, 100), quantity: 1, unit_amount: charge.amountInCents }],
        // Omit the method restriction: the provider offers the methods enabled for this account.
        redirect_url: returnUrl, return_url: returnUrl, notification_urls: [webhook], payment_notification_urls: [webhook],
      } });
      providerPaymentId = checkout.id; invoiceUrl = checkout.links?.find(link => link.rel === "PAY")?.href;
    } else if (charge.provider === "efi") {
      const credential = await getEfiCredential(charge.organizationId);
      providerPaymentId = charge.id.replaceAll("-", "");
      // Persist txid before the call so an early webhook can identify this charge.
      await db.update(paymentCharges).set({ providerPaymentId }).where(eq(paymentCharges.id, id));
      const cob = await efiRequest<{ pixCopiaECola?: string; loc?: { id: number } }>(`/v2/cob/${providerPaymentId}`, credential, { method: "PUT", body: { calendario: { expiracao: Math.max(1, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)) }, valor: { original: (charge.amountInCents / 100).toFixed(2) }, chave: credential.pixKey, solicitacaoPagador: charge.description.slice(0, 140) } });
      pixQrCodePayload = cob.pixCopiaECola;
      if (!pixQrCodePayload && cob.loc) pixQrCodePayload = (await efiRequest<{ qrcode: string }>(`/v2/loc/${cob.loc.id}/qrcode`, credential)).qrcode;
    }
    if (!providerPaymentId || (!invoiceUrl && !pixQrCodePayload)) throw new Error("CHECKOUT_INCOMPLETE");
    if (invoiceUrl && !checkoutUrlIsSafe(invoiceUrl, charge.provider)) throw new Error("CHECKOUT_URL_INVALID");
    await db.update(paymentCharges).set({ providerPaymentId: sql`case when ${paymentCharges.status} in ('paid', 'refunded') then ${paymentCharges.providerPaymentId} else ${providerPaymentId} end`, invoiceUrl, pixQrCodePayload, updatedAt: new Date() }).where(eq(paymentCharges.id, id));
    // Never overwrite a payment already confirmed by a concurrent webhook.
    await db.update(paymentCharges).set({ status: "pending" }).where(and(eq(paymentCharges.id, id), eq(paymentCharges.status, "payment_review")));
    return invoiceUrl;
  } catch (error) {
    const rejected = error instanceof ProviderRequestError && [400, 401, 403, 404, 422].includes(error.status);
    await db.update(paymentCharges).set({ status: rejected ? "issuance_failed" : "payment_review", updatedAt: new Date() }).where(and(eq(paymentCharges.id, id), eq(paymentCharges.status, "payment_review")));
    // Do not retry blindly: the provider may have created the payment before a timeout.
    return undefined;
  }
}
