import { expireBookingReservations } from "@/lib/booking-reservation-expiry";
import { triggerOutboxWorker } from "@/lib/outbox-trigger";
import { roomBookingError } from "@/lib/room-errors";
import { bookingPaymentSettings, createDirectPixPayload, directPixReservation } from "@/lib/booking-payment";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "@/db";
import {
  appointments,
  auditLogs,
  financialEntries,
  financialAccounts,
  organizations,
  paymentCharges,
  professionals,
  services,
  vouchers,
  voucherRedemptions,
} from "@/db/schema";
import { isTimeAvailable } from "@/lib/availability";
import { formatOrganizationDateTime, organizationDate, withAppointmentLock } from "@/lib/appointment-safety";
import { syncAppointmentToGoogleCalendar } from "@/lib/google-calendar";
import { syncAppointmentFinancialEntry } from "@/lib/finance";
import { bookingOnlineProvider, issueBookingOnlinePayment } from "@/lib/booking-online-payment";
import { enqueueAppointmentNotification } from "@/lib/whatsapp-notifications";
import { sendAppointmentManagementEmail } from "@/lib/email";
import { reserveBookingVoucher } from "@/lib/voucher-booking";
import { inspectPublicBooking, lockBookingPatient, PublicBookingConflict } from "@/lib/public-booking-guard";
import { normalizeBrazilianPhone } from "@/lib/phone";

export async function createBookingReservation(request: Request, slug: string, portalClient: { id: string; name: string; phone: string | null; email: string | null }, origin: { source: "booking_page" | "whatsapp"; messageId?: string; conversationId?: string } = {source: "booking_page"}) {
  const payload = await request.json().catch(() => null);
  const body = (payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}) as Record<string, unknown>;
  let name = String(body.name ?? "").trim();
  let phone = normalizeBrazilianPhone(String(body.phone ?? ""));
  let email = String(body.email ?? "").trim() || null;
  const document = String(body.document ?? "").replace(/\D/g, "");
  const voucherCode = String(body.voucherCode ?? "").trim().toUpperCase();
  const serviceId = String(body.serviceId ?? "");
  const professionalId = String(body.professionalId ?? "");
  const startsAt = new Date(String(body.startsAt ?? ""));
  if (![serviceId, professionalId].every(id => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))) return Response.json({ error: "Selecione um procedimento e um profissional válidos." }, { status: 400 });
  if (Number.isNaN(startsAt.getTime())) return Response.json({ error: "Selecione um horário válido." }, { status: 400 });
  const [organization] = await db
    .select()
    .from(organizations)
    .where(
      and(eq(organizations.slug, slug), eq(organizations.bookingEnabled, true))
    )
    .limit(1);
  if (!organization) {
    return Response.json({ error: "Agenda indisponível." }, { status: 404 });
  }

  if (portalClient) {
    name = portalClient.name; phone = portalClient.phone ? normalizeBrazilianPhone(portalClient.phone) : ""; email = portalClient.email;
  } else {
    return Response.json({ error: "Identifique-se na área do cliente antes de agendar." }, { status: 401 });
  }
  const [[service], [professional]] = await Promise.all([
    db
      .select({ duration: services.durationMinutes, price: services.priceInCents, name: services.name, depositType: services.depositType, depositValue: services.depositValue, expiration: services.depositExpirationMinutes, repeatPolicy: services.publicRepeatPolicy })
      .from(services)
      .where(
        and(
          eq(services.id, serviceId),
          eq(services.organizationId, organization.id),
          eq(services.isActive, true)
        )
      )
      .limit(1),
    db
      .select({ id: professionals.id })
      .from(professionals)
      .where(
        and(
          eq(professionals.id, professionalId),
          eq(professionals.organizationId, organization.id),
          eq(professionals.isActive, true),
          eq(professionals.isBookable, true)
        )
      )
      .limit(1),
  ]);
  if (!service || !professional) {
    return Response.json({ error: "Serviço ou profissional inválido." }, { status: 400 });
  }
  const targetDate = organizationDate(startsAt, organization.timezone);
  const today = organizationDate(new Date(), organization.timezone);
  const maximum = new Date(`${today}T12:00:00Z`);
  maximum.setUTCDate(maximum.getUTCDate() + organization.bookingHorizonDays);
  if (targetDate < today || targetDate > maximum.toISOString().slice(0, 10)) return Response.json({ error: "Data fora da janela de agendamento." }, { status: 400 });
  const acknowledgedIds = Array.isArray(body.acknowledgedAppointmentIds) ? body.acknowledgedAppointmentIds.filter((id): id is string => typeof id === "string").slice(0, 100) : [];
  try {
    const paymentSettings = bookingPaymentSettings(organization.bookingPaymentSettings);
    const direct = paymentSettings.mode === "pix_direct";
    // Do not borrow another database connection while holding the booking transaction.
    // Defer errors until after replay detection so existing reservations still work if settings change.
    let selectedProvider: Awaited<ReturnType<typeof bookingOnlineProvider>> | undefined;
    let providerError: unknown;
    if (!direct && service.depositType !== "none") {
      try { selectedProvider = await bookingOnlineProvider(organization.id); }
      catch (error) { providerError = error; }
    }
    await expireBookingReservations({organizationId:organization.id});
    const manageToken = randomUUID();
    const appointment = await withAppointmentLock(organization.id, professionalId, async (tx) => {
      await lockBookingPatient(tx, organization.id, portalClient.id);
      const replay = await inspectPublicBooking(tx, {
        organizationId: organization.id, clientId: portalClient.id, serviceId, professionalId, startsAt,
        endsAt: new Date(startsAt.getTime() + service.duration * 60_000),
        repeatPolicy: service.repeatPolicy, acknowledgedIds,
      });
      if (replay) return { ...replay, replay: true as const };
      const pricing = await reserveBookingVoucher(tx, organization.id, portalClient.id, voucherCode, service.price);
      const { voucher } = pricing;
      const finalPrice = pricing.finalPriceInCents;
      const depositAmount = service.depositType === "full" ? finalPrice : service.depositType === "percentage" ? Math.round(finalPrice * service.depositValue / 100) : service.depositType === "fixed" ? Math.min(finalPrice, service.depositValue) : 0;
      let onlineProvider: Awaited<ReturnType<typeof bookingOnlineProvider>> | undefined;
      if (depositAmount > 0) {
        if (direct) {
          const [account] = paymentSettings.accountId ? await tx.select({ id: financialAccounts.id }).from(financialAccounts).where(and(eq(financialAccounts.id, paymentSettings.accountId), eq(financialAccounts.organizationId, organization.id), eq(financialAccounts.isActive, true))).limit(1) : [];
          if (!account || !paymentSettings.key || !paymentSettings.receiverName || !paymentSettings.city) throw new Error("DIRECT_PIX_NOT_CONFIGURED");
        } else {
          if (providerError) throw providerError;
          if (!selectedProvider) throw new Error("BOOKING_PROVIDER_NOT_CONFIGURED");
          onlineProvider = selectedProvider;
        }
      }
      if (depositAmount > 0 && !direct && ![11, 14].includes(document.length)) throw new Error("DEPOSIT_DOCUMENT_INVALID");
      const available = await isTimeAvailable({
        organizationId: organization.id, timezone: organization.timezone,
        date: organizationDate(startsAt, organization.timezone), serviceId, professionalId,
        slotIntervalMinutes: organization.slotIntervalMinutes,
        noticeHours: organization.bookingNoticeHours, startsAt,
      });
      if (!available) throw new Error("APPOINTMENT_CONFLICT");
      const clientId = portalClient.id;
      const appointmentEnd = new Date(startsAt.getTime() + service.duration * 60_000);
      const [created] = await tx
        .insert(appointments)
        .values({
          organizationId: organization.id,
          clientId,
          serviceId,
          professionalId,
          startsAt,
          endsAt: appointmentEnd,
          priceInCents: finalPrice,
          source: origin.source,
          depositStatus: depositAmount > 0 ? (direct ? "direct_pending" : "pending") : "not_required",
          depositAmountInCents: depositAmount,
          reservationExpiresAt: depositAmount > 0 ? new Date(Date.now() + service.expiration * 60_000) : null,
          publicManageToken: manageToken,
          metadata: origin.source === "whatsapp" ? {whatsappCommandMessageId: origin.messageId, conversationId: origin.conversationId} : {},
        })
        .returning({ id: appointments.id, clientId: appointments.clientId, reservationExpiresAt: appointments.reservationExpiresAt });
      if (depositAmount > 0 && direct) {
        const payload = createDirectPixPayload({ key: paymentSettings.key!, receiverName: paymentSettings.receiverName!, city: paymentSettings.city!, amountInCents: depositAmount, reference: created.id });
        const [entry] = await tx.insert(financialEntries).values({ organizationId: organization.id, clientId, attendanceId: created.id, type: "receivable", source: "appointment_deposit_direct", status: "pending", description: `Sinal Pix - ${service.name}`, category: "Sinais de agendamento", amountInCents: depositAmount, accountId: paymentSettings.accountId!, dueDate: organizationDate(new Date(), organization.timezone), paymentMethod: "pix", paymentMethodName: "Pix direto" }).returning({ id: financialEntries.id });
        await tx.update(appointments).set({ metadata: { ...(origin.source === "whatsapp" ? {whatsappCommandMessageId: origin.messageId, conversationId: origin.conversationId} : {}), directPix: { key: paymentSettings.key!, receiverName: paymentSettings.receiverName!, city: paymentSettings.city!, accountId: paymentSettings.accountId!, payload, entryId: entry.id } } }).where(eq(appointments.id, created.id));
      }
      if (depositAmount > 0 && onlineProvider) {
        const chargeId = randomUUID();
        const dueDate = organizationDate(new Date(), organization.timezone);
        const [entry] = await tx.insert(financialEntries).values({ organizationId: organization.id, clientId, attendanceId: created.id, type: "receivable", source: "appointment_deposit", accountId: onlineProvider.accountId, paymentMethodId: onlineProvider.paymentMethodId, paymentMethodName: onlineProvider.paymentMethodName, status: "pending", description: "Sinal - " + service.name, category: "Sinais de agendamento", amountInCents: depositAmount, dueDate }).returning({ id: financialEntries.id });
        await tx.insert(paymentCharges).values({ id: chargeId, organizationId: organization.id, provider: onlineProvider.provider, originType: "appointment", originId: created.id, financialEntryId: entry.id, clientId, paymentMethod: "link", status: "payment_review", amountInCents: depositAmount, description: "Sinal - " + service.name, customerName: name, customerDocument: document, customerEmail: email, customerPhone: phone, dueDate, metadata: { issuanceState: "new", appointmentId: created.id, environment: onlineProvider.environment, collectorId: onlineProvider.metadata?.accountId, expiresAt: new Date(Date.now() + service.expiration * 60000).toISOString() } });
        await tx.update(appointments).set({ metadata: { ...(origin.source === "whatsapp" ? {whatsappCommandMessageId: origin.messageId, conversationId: origin.conversationId} : {}), onlinePayment: { chargeId, provider: onlineProvider.provider } } }).where(eq(appointments.id, created.id));
      }
      await tx.insert(auditLogs).values({
        organizationId: organization.id,
        action: "create",
        entityType: "appointment",
        entityId: created.id,
        details: {
          clientId: created.clientId,
          source: origin.source,
          startsAt: startsAt.toISOString(),
          status: "scheduled",
        },
      });
      if (voucher) {
        await tx.update(vouchers).set({ usedCount: voucher.usedCount + 1 }).where(eq(vouchers.id, voucher.id));
        await tx.insert(voucherRedemptions).values({ organizationId: organization.id, voucherId: voucher.id, clientId, appointmentId: created.id, discountInCents: pricing.discountInCents });
      }
      return { ...created, finalPrice, depositAmount, replay: false as const };

    });
    if (appointment.replay ? appointment.depositAmountInCents > 0 : appointment.depositAmount > 0) await triggerOutboxWorker();
    if (appointment.replay) {
      const [charge] = await db.select({ url: paymentCharges.invoiceUrl }).from(paymentCharges)
        .where(and(eq(paymentCharges.organizationId, organization.id), eq(paymentCharges.originId, appointment.id), eq(paymentCharges.originType, "appointment"))).limit(1);
      return Response.json({ id: appointment.id, existing: true, depositStatus: appointment.depositStatus, paymentUrl: charge?.url || undefined, reservationExpiresAt: appointment.reservationExpiresAt, depositPending: ["pending", "direct_pending", "direct_review"].includes(appointment.depositStatus), directPix: Boolean(directPixReservation(appointment.metadata)), manageUrl: appointment.publicManageToken ? `/agendamento/${appointment.publicManageToken}` : undefined }, { headers: { "Cache-Control": "no-store" } });
    }
    const { finalPrice, depositAmount } = appointment;
    await syncAppointmentFinancialEntry(appointment.id);
    if (depositAmount > 0) {
      const remaining = finalPrice - depositAmount;
      if (remaining > 0) await db.update(financialEntries).set({ amountInCents: remaining, description: `Saldo - ${service.name}`, updatedAt: new Date() }).where(eq(financialEntries.appointmentId, appointment.id));
      else await db.delete(financialEntries).where(eq(financialEntries.appointmentId, appointment.id));
    }
    await syncAppointmentToGoogleCalendar(appointment.id);
    let paymentUrl: string | undefined;
    if (depositAmount > 0 && !direct) {
      const [charge] = await db.select({ id: paymentCharges.id }).from(paymentCharges).where(and(eq(paymentCharges.organizationId, organization.id), eq(paymentCharges.originType, "appointment"), eq(paymentCharges.originId, appointment.id))).limit(1);
      if (charge) paymentUrl = await issueBookingOnlinePayment(charge.id, manageToken);
    }
    if (!depositAmount) await enqueueAppointmentNotification(appointment.id, "confirmation");
    if (email) {
      const manageUrl = new URL(`/agendamento/${manageToken}`, request.url).toString();
      try {
        await sendAppointmentManagementEmail({
          email,
          clientName: name,
          organizationName: organization.name,
          serviceName: service.name,
          scheduledFor: formatOrganizationDateTime(startsAt, organization.timezone),
          manageUrl,
          appointmentId: appointment.id,
          version: "created",
        });
      } catch (emailError) {
        console.error("[public-booking] Falha ao enviar link de gerenciamento", emailError);
      }
    }
    return Response.json({ id: appointment.id, manageToken, reservationExpiresAt: appointment.reservationExpiresAt, paymentUrl, directPix: depositAmount > 0 && direct, depositPending: depositAmount > 0, manageUrl: `/agendamento/${manageToken}` }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "BOOKING_PAYMENT_ACCOUNT_NOT_CONFIGURED") return Response.json({ error: "A clínica precisa vincular uma conta financeira ativa à forma Link de pagamento (Pix para Efí). Fale com a equipe." }, { status: 409 });
    if (error instanceof Error && error.message === "BOOKING_PROVIDER_NOT_CONFIGURED") return Response.json({ error: "A clínica precisa habilitar e escolher o provedor padrão de cobranças online. Fale com a equipe." }, { status: 409 });
    if (error instanceof Error && error.message === "DIRECT_PIX_NOT_CONFIGURED") return Response.json({ error: "O recebimento Pix deste serviço ainda não está configurado. Fale com a equipe." }, { status: 409 });
    if (error instanceof PublicBookingConflict) {
      const messages = { CLIENT_APPOINTMENT_CONFLICT: "Este paciente já possui outro agendamento neste horário. Reagende o existente ou escolha um horário sem sobreposição.", SERVICE_REPEAT_BLOCKED: "Já existe uma reserva futura deste procedimento. Gerencie a reserva existente ou fale com a clínica.", SERVICE_REPEAT_CONFIRMATION: "Este paciente já possui reserva futura deste procedimento. Confira e confirme se deseja outra sessão." };
      return Response.json({ error: messages[error.code], code: error.code, existingAppointments: error.existing.map(item => ({ id: item.id, startsAt: item.startsAt, manageUrl: item.publicManageToken ? `/agendamento/${item.publicManageToken}` : undefined })) }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    const roomError = roomBookingError(error);
    if (roomError) return Response.json({ error: roomError }, { status: 409 });
    if (error instanceof Error && error.message === "VOUCHER_INVALID") return Response.json({ error: "Voucher inválido, expirado, esgotado ou indisponível para este cliente." }, { status: 400 });
    if (error instanceof Error && error.message === "DEPOSIT_DOCUMENT_INVALID") return Response.json({ error: "Informe um CPF ou CNPJ válido para gerar o sinal." }, { status: 400 });
    if (error instanceof Error && error.message === "APPOINTMENT_CONFLICT") {
      return Response.json(
        { error: "Este horário acabou de ficar indisponível. Escolha outro." },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "CLIENT_APPOINTMENT_CONFLICT") return Response.json({ error: "Você já possui outro agendamento neste horário." }, { status: 409 });
    return Response.json(
      { error: "Não foi possível concluir o agendamento." },
      { status: 500 }
    );
  }
}
