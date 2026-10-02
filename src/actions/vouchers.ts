"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/db";
import { auditLogs, clients, voucherDeliveries, vouchers } from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { assertOrganizationPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { zonedDate } from "@/lib/availability";
import { voucherChannels } from "@/lib/voucher-delivery";
import { drainVoucherCampaign } from "@/lib/voucher-drain";
import { voucherBenefit, voucherBookingUrl, voucherCode, voucherError, voucherMessage, voucherValue } from "@/lib/voucher-rules";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export async function createVoucher(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "services.manage");
  const code = voucherCode(text(data, "code"));
  const discountType = text(data, "discountType");
  if (!/^[A-Z0-9_-]{3,40}$/.test(code) || !["fixed", "percentage"].includes(discountType)) return { error: "Use um código de 3 a 40 letras, números, hífen ou sublinhado." };
  let discountValue: number;
  try { discountValue = voucherValue(text(data, "discountValue"), discountType); } catch (error) { return { error: (error as Error).message }; }
  const clientId = text(data, "clientId") || null;
  if (clientId) {
    if (!uuid(clientId)) return { error: "Selecione um cliente válido." };
    const [client] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, organization.id))).limit(1);
    if (!client) return { error: "Cliente indisponível." };
  }
  const rawLimit = text(data, "maxUses");
  const maxUses = rawLimit ? Number(rawLimit) : clientId ? 1 : null;
  if (maxUses !== null && (!Number.isSafeInteger(maxUses) || maxUses < 1 || maxUses > 2147483647)) return { error: "Informe um limite de usos inteiro e positivo." };
  const date = text(data, "validUntil");
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date)) return { error: "Informe uma validade válida." };
  const validUntil = date ? new Date(zonedDate(date, "23:59", organization.timezone).getTime() + 59_999) : null;
  if (validUntil && validUntil < new Date()) return { error: "A validade deve ser hoje ou uma data futura." };
  const [existing] = await db.select({ id: vouchers.id }).from(vouchers).where(and(eq(vouchers.organizationId, organization.id), eq(vouchers.code, code))).limit(1);
  if (existing) return { error: "Já existe um voucher com este código nesta empresa." };
  const [created] = await db.insert(vouchers).values({ organizationId: organization.id, code, description: text(data, "description") || null, discountType, discountValue, maxUses, validUntil, clientId }).returning({ id: vouchers.id });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "create", entityType: "voucher", entityId: created.id });
  revalidatePath("/crescimento");
}

export async function queueVoucherCampaign(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "crm.manage");
  const voucherId = text(data, "voucherId");
  const clientIds = [...new Set(data.getAll("clientId").map(String))];
  const channel = text(data, "channel");
  if (!uuid(voucherId) || !clientIds.length || clientIds.length > 100 || clientIds.some((id) => !uuid(id))) return { error: "Selecione o voucher e de 1 a 100 destinatários." };
  if (!["email", "whatsapp"].includes(channel)) return { error: "Selecione um canal válido." };
  const available = await voucherChannels(organization.id);
  if (!available[channel as keyof typeof available]) return { error: channel === "email" ? "Configure o envio de e-mail antes de enviar vouchers." : "WhatsApp automático requer canal ativo e modelo de marketing aprovado para vouchers. Você pode compartilhar individualmente pelo WhatsApp." };
  const [[voucher], recipients] = await Promise.all([
    db.select().from(vouchers).where(and(eq(vouchers.id, voucherId), eq(vouchers.organizationId, organization.id))).limit(1),
    db.select().from(clients).where(and(eq(clients.organizationId, organization.id), inArray(clients.id, clientIds))),
  ]);
  if (!voucher || recipients.length !== clientIds.length || recipients.some((client) => voucherError(voucher, client.id))) return { error: "Voucher indisponível para algum destinatário. Confira a validade e o cliente exclusivo." };
  const batchId = crypto.randomUUID();
  const campaignName = text(data, "campaignName").slice(0, 100) || `Voucher ${voucher.code}`;
  const bookingUrl = voucherBookingUrl(organization, voucher.code, process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
  const validity = voucher.validUntil ? `Válido até ${voucher.validUntil.toLocaleDateString("pt-BR", { timeZone: organization.timezone })}` : "Sem prazo de validade";
  const rows = recipients.map((client) => {
    const phone = (client.phone || "").replace(/\D/g, "");
    const recipient = channel === "email" ? client.email?.trim() || "" : phone.startsWith("55") ? phone : `55${phone}`;
    return { organizationId: organization.id, voucherId, clientId: client.id, batchId, campaignName, channel, recipient, bookingUrl, createdByUserId: session.user.id,
      message: voucherMessage({ clientName: client.name, organizationName: organization.name, benefit: voucherBenefit(voucher), code: voucher.code, validity, url: bookingUrl, exclusive: Boolean(voucher.clientId) }) };
  });
  if (rows.some((row) => channel === "email" ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.recipient) : !/^55\d{10,11}$/.test(row.recipient))) return { error: "Algum destinatário não possui contato válido para o canal escolhido." };
  const inserted = await db.transaction(async (tx) => {
    const created = await tx.insert(voucherDeliveries).values(rows).onConflictDoNothing().returning({ id: voucherDeliveries.id });
    if (created.length) await tx.insert(auditLogs).values({ organizationId: organization.id, userId: session.user.id, action: "queue", entityType: "voucher_campaign", entityId: batchId, details: { voucherId, channel, recipients: created.length, campaignName } });
    return created;
  });
  after(async () => { await drainVoucherCampaign(organization.id); });
  revalidatePath("/crescimento");
  return { warning: `${inserted.length} envio(s) colocado(s) na fila.${inserted.length !== rows.length ? " Destinatários já enviados ou enfileirados foram ignorados." : ""} Acompanhe em Histórico de envios.` };
}

export async function toggleVoucher(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "services.manage");
  const id = text(data, "voucherId"); if (!uuid(id)) return { error: "Voucher inválido." };
  const isActive = text(data, "isActive") === "true";
  await db.update(vouchers).set({ isActive }).where(and(eq(vouchers.id, id), eq(vouchers.organizationId, organization.id)));
  if (!isActive) await db.update(voucherDeliveries).set({ status: "cancelled", lastError: "Voucher desativado.", updatedAt: new Date() }).where(and(eq(voucherDeliveries.organizationId, organization.id), eq(voucherDeliveries.voucherId, id), eq(voucherDeliveries.status, "pending")));
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: isActive ? "activate" : "deactivate", entityType: "voucher", entityId: id });
  revalidatePath("/crescimento");
}

export async function resumeVoucherDeliveries(data: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "crm.manage");
  const id = text(data, "deliveryId");
  if (id) {
    if (!uuid(id)) return { error: "Envio inválido." };
    await db.update(voucherDeliveries).set({ status: "pending", lastError: null, updatedAt: new Date() }).where(and(eq(voucherDeliveries.id, id), eq(voucherDeliveries.organizationId, organization.id), eq(voucherDeliveries.status, "failed")));
  }
  after(async () => { await drainVoucherCampaign(organization.id); });
  revalidatePath("/crescimento");
}
