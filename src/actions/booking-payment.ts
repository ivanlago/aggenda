"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { appointments, auditLogs, financialAccounts, financialEntries, organizations } from "@/db/schema";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";
import { directPixReservation, normalizePixKey, type BookingPaymentSettings } from "@/lib/booking-payment";
import { organizationDate } from "@/lib/organization-time";
import { syncAppointmentToGoogleCalendar } from "@/lib/google-calendar";
import { enqueueAppointmentNotification } from "@/lib/whatsapp-notifications";

export async function saveBookingPaymentSettings(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "integrations.manage", organization.teamPermissionOverrides);
  const text = (key: string) => String(data.get(key) ?? "").trim();
  if (!["pix_direct", "integrated"].includes(text("mode"))) return { error: "Escolha como receber o pagamento antecipado." };
  const mode = text("mode") as BookingPaymentSettings["mode"];
  const settings: BookingPaymentSettings = { mode };
  if (mode === "pix_direct") {
    try { settings.key = normalizePixKey(text("keyType"), text("key")); }
    catch (error) { return { error: (error as Error).message }; }
    settings.keyType = text("keyType") as BookingPaymentSettings["keyType"];
    settings.receiverName = text("receiverName"); settings.city = text("city"); settings.accountId = text("accountId");
    if (settings.receiverName.length < 2 || settings.receiverName.length > 100 || settings.city.length < 2 || settings.city.length > 60) return { error: "Informe titular e cidade do recebedor." };
    if (!/^[\da-f-]{36}$/i.test(settings.accountId)) return { error: "Selecione uma conta financeira ativa." };
    const [account] = await db.select({ id: financialAccounts.id }).from(financialAccounts).where(and(eq(financialAccounts.id, settings.accountId), eq(financialAccounts.organizationId, organization.id), eq(financialAccounts.isActive, true))).limit(1);
    if (!account) return { error: "Selecione uma conta financeira ativa da empresa." };
  } else if (organization.bookingPaymentSettings.mode === "pix_direct") {
    // Preserve the saved key when temporarily switching to integrated payments.
    Object.assign(settings, organization.bookingPaymentSettings, { mode });
  }
  await db.transaction(async tx => {
    await tx.update(organizations).set({ bookingPaymentSettings: settings, updatedAt: new Date() }).where(eq(organizations.id, organization.id));
    await tx.insert(auditLogs).values({ organizationId: organization.id, userId: session.user.id, action: "update", entityType: "booking_payment_settings", entityId: organization.id, details: { mode, accountId: settings.accountId } });
  });
  revalidatePath("/configuracoes");
}

export async function confirmBookingDirectPix(data: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.manage", organization.teamPermissionOverrides);
  if (data.get("verified") !== "on") return { error: "Confira o crédito no banco e marque a confirmação." };
  const id = String(data.get("id") ?? "");
  if (!/^[\da-f-]{36}$/i.test(id)) return { error: "Agendamento inválido." };
  const result = await db.transaction(async tx => {
    const [item] = await tx.select().from(appointments).where(and(eq(appointments.organizationId, organization.id), eq(appointments.id, id))).for("update");
    const pix = directPixReservation(item?.metadata);
    if (!item || !pix) return { error: "Reserva Pix não encontrada." };
    if (item.depositStatus === "paid") return { error: "Este Pix já foi confirmado. Nenhum novo recebimento foi registrado." };
    if (!["scheduled", "confirmed"].includes(item.status) || !["direct_pending", "direct_review"].includes(item.depositStatus)) return { error: "Esta reserva não permite confirmar o Pix. Confira o pagamento e trate o agendamento com a equipe." };
    const [entry] = await tx.select().from(financialEntries).where(and(eq(financialEntries.id, pix.entryId), eq(financialEntries.organizationId, organization.id))).for("update");
    if (!entry || entry.amountInCents !== item.depositAmountInCents || entry.source !== "appointment_deposit_direct") return { error: "O lançamento do sinal precisa de revisão financeira." };
    const [account] = await tx.select({ id: financialAccounts.id }).from(financialAccounts).where(and(eq(financialAccounts.id, pix.accountId), eq(financialAccounts.organizationId, organization.id))).limit(1);
    if (!account) return { error: "A conta financeira do sinal não foi encontrada." };
    const now = new Date();
    await tx.update(financialEntries).set({ status: "received", accountId: account.id, realizedDate: organizationDate(now, organization.timezone), paymentMethod: "pix", paymentMethodName: "Pix direto", updatedAt: now }).where(eq(financialEntries.id, entry.id));
    await tx.update(appointments).set({ depositStatus: "paid", status: "confirmed", confirmedAt: now, reservationExpiresAt: null, metadata: { ...item.metadata, directPix: { ...pix, confirmedAt: now.toISOString(), confirmedBy: session.user.id } }, updatedAt: now }).where(eq(appointments.id, id));
    await tx.insert(auditLogs).values({ organizationId: organization.id, userId: session.user.id, action: "confirm_direct_pix", entityType: "appointment", entityId: id, details: { amountInCents: item.depositAmountInCents, financialEntryId: entry.id, accountId: account.id, verifiedInBank: true } });
    return { ok: true };
  });
  if ("error" in result) return result;
  const effects = await Promise.allSettled([syncAppointmentToGoogleCalendar(id), enqueueAppointmentNotification(id, "confirmation")]);
  effects.forEach(effect => { if (effect.status === "rejected") console.error("[booking-direct-pix] Falha na sincronização após confirmação", effect.reason); });
  revalidatePath("/agenda"); revalidatePath("/financeiro/lancamentos"); revalidatePath("/agendamento", "layout"); revalidatePath("/cliente", "layout");
}
