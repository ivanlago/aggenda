import { and, eq, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { clients, organizations, organizationServicePlans, voucherDeliveries, vouchers, whatsappChannels } from "@/db/schema";
import { sendVoucherEmail } from "@/lib/email";
import { decryptWhatsAppToken } from "@/lib/whatsapp-token";
import { voucherBenefit, voucherError } from "@/lib/voucher-rules";

export async function voucherChannels(organizationId: string, database = db) {
  const [[channel], [plan]] = await Promise.all([
    database.select().from(whatsappChannels).where(and(eq(whatsappChannels.organizationId, organizationId), eq(whatsappChannels.isActive, true))).limit(1),
    database.select().from(organizationServicePlans).where(eq(organizationServicePlans.organizationId, organizationId)).limit(1),
  ]);
  return { email: Boolean(process.env.RESEND_API_KEY), whatsapp: Boolean(channel?.phoneNumberId && (channel.encryptedAccessToken || process.env.META_WHATSAPP_ACCESS_TOKEN) && process.env.META_TEMPLATE_VOUCHER_OFFER && plan && plan.whatsappServiceCode !== "assisted") };
}

/** Persistent queue: each send is claimed under a row lock; interrupted claims expire. */
export async function processVoucherDeliveries(organizationId?: string, limit = 50, database = db) {
  const deadline = Date.now() + 45_000;
  let sent = 0;
  let failed = 0;
  for (let index = 0; index < limit && Date.now() < deadline; index++) {
    const delivery = await database.transaction(async (tx) => {
      const [row] = await tx.select().from(voucherDeliveries).where(and(
        organizationId ? eq(voucherDeliveries.organizationId, organizationId) : undefined,
        or(eq(voucherDeliveries.status, "pending"), and(eq(voucherDeliveries.status, "processing"), lt(voucherDeliveries.updatedAt, new Date(Date.now() - 5 * 60_000)))),
      )).orderBy(voucherDeliveries.createdAt).limit(1).for("update", { skipLocked: true });
      if (!row) return null;
      await tx.update(voucherDeliveries).set({ status: "processing", attempts: sql`${voucherDeliveries.attempts} + 1`, updatedAt: new Date() }).where(eq(voucherDeliveries.id, row.id));
      return row;
    });
    if (!delivery) break;
    if (delivery.attempts >= 3 && delivery.status === "processing") {
      await database.update(voucherDeliveries).set({ status: "failed", lastError: "Envio interrompido repetidamente. Confira antes de tentar novamente.", updatedAt: new Date() }).where(eq(voucherDeliveries.id, delivery.id));
      continue;
    }
    try {
      const [[voucher], [client], [organization]] = await Promise.all([
        database.select().from(vouchers).where(and(eq(vouchers.id, delivery.voucherId), eq(vouchers.organizationId, delivery.organizationId))).limit(1),
        database.select().from(clients).where(and(eq(clients.id, delivery.clientId), eq(clients.organizationId, delivery.organizationId))).limit(1),
        database.select().from(organizations).where(eq(organizations.id, delivery.organizationId)).limit(1),
      ]);
      if (!client || !organization || voucherError(voucher, delivery.clientId)) {
        await database.update(voucherDeliveries).set({ status: "cancelled", lastError: "Voucher indisponível ou destinatário removido.", updatedAt: new Date() }).where(eq(voucherDeliveries.id, delivery.id));
        continue;
      }
      let providerMessageId: string | undefined;
      if (delivery.channel === "email") {
        providerMessageId = await sendVoucherEmail({ email: delivery.recipient, organizationName: organization.name, message: delivery.message, bookingUrl: delivery.bookingUrl, deliveryId: delivery.id });
      } else {
        const [channel] = await database.select().from(whatsappChannels).where(and(eq(whatsappChannels.organizationId, delivery.organizationId), eq(whatsappChannels.isActive, true))).limit(1);
        if (!(await voucherChannels(delivery.organizationId, database)).whatsapp || !channel) throw new Error("WhatsApp automático requer canal ativo e modelo de marketing aprovado para vouchers.");
        const token = channel.encryptedAccessToken ? decryptWhatsAppToken(channel.encryptedAccessToken) : process.env.META_WHATSAPP_ACCESS_TOKEN;
        const parameters = [client.name, organization.name, voucherBenefit(voucher), voucher.code, voucher.validUntil ? `Válido até ${voucher.validUntil.toLocaleDateString("pt-BR", { timeZone: organization.timezone })}` : "Sem prazo de validade", delivery.bookingUrl];
        const response = await fetch(`https://graph.facebook.com/${process.env.META_WHATSAPP_GRAPH_VERSION || "v23.0"}/${channel.phoneNumberId}/messages`, {
          method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", to: delivery.recipient, type: "template", template: { name: process.env.META_TEMPLATE_VOUCHER_OFFER, language: { code: "pt_BR" }, components: [{ type: "body", parameters: parameters.map((text) => ({ type: "text", text })) }] } }), signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw new Error(`WhatsApp recusou o envio (HTTP ${response.status}). Confira o canal e a aprovação do modelo.`);
        providerMessageId = (await response.json()).messages?.[0]?.id;
        await database.execute(sql`insert into organization_usage_counters (organization_id, period_start, metric, quantity, updated_at)
          values (${delivery.organizationId}, date_trunc('month', now())::date, 'whatsapp.outbound', 1, now())
          on conflict (organization_id, period_start, metric) do update set quantity = organization_usage_counters.quantity + 1, updated_at = now()`);
      }
      await database.update(voucherDeliveries).set({ status: "sent", sentAt: new Date(), providerMessageId, lastError: null, updatedAt: new Date() }).where(eq(voucherDeliveries.id, delivery.id));
      sent++;
    } catch (error) {
      await database.update(voucherDeliveries).set({ status: "failed", lastError: (error instanceof Error ? error.message : "Falha no envio").slice(0, 300), updatedAt: new Date() }).where(eq(voucherDeliveries.id, delivery.id));
      failed++;
    }
    // Stay below the default Resend API rate limit; campaigns resume on the next drain.
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  return { sent, failed };
}
