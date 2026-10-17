import { roomBookingError } from "@/lib/room-errors";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "@/db";
import {
  appointments,
  auditLogs,
  financialEntries,
  organizations,
  paymentChargeEvents,
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
import { organizationAsaasRequest } from "@/lib/asaas";
import { getOrganizationAsaasCredential } from "@/lib/organization-asaas";
import { enqueueAppointmentNotification } from "@/lib/whatsapp-notifications";
import { sendAppointmentManagementEmail } from "@/lib/email";
import { portalRequestClient } from "@/lib/portal-request";
import { reserveBookingVoucher } from "@/lib/voucher-booking";
import { inspectPublicBooking, lockBookingPatient, PublicBookingConflict } from "@/lib/public-booking-guard";
import { normalizeBrazilianPhone } from "@/lib/phone";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
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
  const portalClient = await portalRequestClient(request, organization.id, String(body.patientId || "") || undefined);
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
      if (depositAmount > 0 && ![11, 14].includes(document.length)) throw new Error("DEPOSIT_DOCUMENT_INVALID");
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
          source: "booking_page",
          depositStatus: depositAmount > 0 ? "pending" : "not_required",
          depositAmountInCents: depositAmount,
          reservationExpiresAt: depositAmount > 0 ? new Date(Date.now() + service.expiration * 60_000) : null,
          publicManageToken: manageToken,
        })
        .returning({ id: appointments.id, clientId: appointments.clientId });
      await tx.insert(auditLogs).values({
        organizationId: organization.id,
        action: "create",
        entityType: "appointment",
        entityId: created.id,
        details: {
          clientId: created.clientId,
          source: "booking_page",
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
    if (appointment.replay) {
      const [charge] = await db.select({ url: paymentCharges.invoiceUrl }).from(paymentCharges)
        .where(and(eq(paymentCharges.organizationId, organization.id), eq(paymentCharges.originId, appointment.id), eq(paymentCharges.originType, "appointment"))).limit(1);
      return Response.json({ id: appointment.id, existing: true, paymentUrl: charge?.url || undefined, depositPending: appointment.depositStatus === "pending", manageUrl: appointment.publicManageToken ? `/agendamento/${appointment.publicManageToken}` : undefined }, { headers: { "Cache-Control": "no-store" } });
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
    if (depositAmount > 0) {
      const credential = await getOrganizationAsaasCredential(organization.id);
      type CustomerList = { data?: Array<{ id: string }> }; type Customer = { id: string }; type Payment = { id: string; invoiceUrl?: string };
      const found = await organizationAsaasRequest<CustomerList>(`/customers?cpfCnpj=${document}&limit=1`, credential);
      const customerId = found.data?.[0]?.id ?? (await organizationAsaasRequest<Customer>("/customers", credential, { method: "POST", body: { name, cpfCnpj: document, email: email ?? undefined, phone } })).id;
      const chargeId = randomUUID();
      const dueDate = organizationDate(new Date(), organization.timezone);
      const payment = await organizationAsaasRequest<Payment>("/payments", credential, { method: "POST", body: { customer: customerId, billingType: "UNDEFINED", value: depositAmount / 100, dueDate, description: `Sinal - ${service.name}`, externalReference: `charge:${chargeId}` } });
      const [entry] = await db.insert(financialEntries).values({ organizationId: organization.id, clientId: appointment.clientId, type: "receivable", source: "appointment_deposit", status: "pending", description: `Sinal - ${service.name}`, category: "Sinais de agendamento", amountInCents: depositAmount, dueDate }).returning({ id: financialEntries.id });
      await db.insert(paymentCharges).values({ id: chargeId, organizationId: organization.id, providerPaymentId: payment.id, providerCustomerId: customerId, originType: "appointment", originId: appointment.id, financialEntryId: entry.id, clientId: appointment.clientId, paymentMethod: "link", status: "pending", amountInCents: depositAmount, description: `Sinal - ${service.name}`, customerName: name, customerDocument: document, customerEmail: email, customerPhone: phone, dueDate, invoiceUrl: payment.invoiceUrl, metadata: { appointmentId: appointment.id } });
      await db.insert(paymentChargeEvents).values({ organizationId: organization.id, chargeId, eventType: "charge_created", status: "pending", payload: { appointmentId: appointment.id, publicBooking: true } });
      paymentUrl = payment.invoiceUrl;
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
    return Response.json({ id: appointment.id, manageToken, paymentUrl, manageUrl: `/agendamento/${manageToken}` }, { status: 201 });
  } catch (error) {
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
