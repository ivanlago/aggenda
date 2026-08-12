import { and, eq, gte, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { appointments, clients, professionals, services } from "@/db/schema";
import { apiError, requireN8nOrganization } from "@/lib/n8n-api";
import { isTimeAvailable } from "@/lib/availability";
import { formatOrganizationDateTime, organizationDate, withAppointmentLock } from "@/lib/appointment-safety";
import { syncAppointmentToGoogleCalendar } from "@/lib/google-calendar";
import { reservePackageSession } from "@/lib/package-balance";
import { syncAppointmentFinancialEntry } from "@/lib/finance";

const inputSchema = z.object({
  clientId: z.string().uuid(),
  serviceId: z.string().uuid(),
  professionalId: z.string().uuid().optional().nullable(),
  startsAt: z.coerce.date(),
  notes: z.string().optional().nullable(),
  clientPackageId: z.string().uuid().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const auth = await requireN8nOrganization(request);
  if ("error" in auth) return auth.error;

  const phone = request.nextUrl.searchParams.get("phone")?.replace(/\D/g, "");
  const clientId = request.nextUrl.searchParams.get("clientId");
  const conditions = [
    eq(appointments.organizationId, auth.organization.id),
    gte(appointments.startsAt, new Date()),
  ];
  if (phone) {
    const nationalPhone = phone.startsWith("55") ? phone.slice(2) : phone;
    conditions.push(sql`regexp_replace(coalesce(${clients.phone}, ''), '\\D', '', 'g') in (${phone}, ${nationalPhone})`);
  }
  if (clientId) conditions.push(eq(clients.id, clientId));

  const items = await db.select({
    id: appointments.id,
    startsAt: appointments.startsAt,
    endsAt: appointments.endsAt,
    status: appointments.status,
    clientId: clients.id,
    clientName: clients.name,
    clientPhone: clients.phone,
    serviceId: services.id,
    serviceName: services.name,
    professionalId: professionals.id,
    professionalName: professionals.name,
  }).from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .leftJoin(professionals, eq(professionals.id, appointments.professionalId))
    .where(and(...conditions))
    .orderBy(appointments.startsAt);

  return NextResponse.json({
    timezone: auth.organization.timezone,
    appointments: items.map((item) => ({
      ...item,
      startsAtLocal: formatOrganizationDateTime(item.startsAt, auth.organization.timezone),
      endsAtLocal: formatOrganizationDateTime(item.endsAt, auth.organization.timezone),
    })),
  });
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireN8nOrganization(request);
    if ("error" in auth) return auth.error;
    const input = inputSchema.parse(await request.json());

    const [service] = await db.select({
      durationMinutes: services.durationMinutes,
      priceInCents: services.priceInCents,
    }).from(services).where(and(
      eq(services.id, input.serviceId),
      eq(services.organizationId, auth.organization.id)
    )).limit(1);
    if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });

    if (input.professionalId) {
      const [professional] = await db
        .select({ id: professionals.id })
        .from(professionals)
        .where(
          and(
            eq(professionals.id, input.professionalId),
            eq(professionals.organizationId, auth.organization.id),
            eq(professionals.isActive, true),
            eq(professionals.isBookable, true)
          )
        )
        .limit(1);
      if (!professional) {
        return NextResponse.json(
          { error: "Professional is not available for booking" },
          { status: 404 }
        );
      }
    }

    const [client] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(
        and(
          eq(clients.id, input.clientId),
          eq(clients.organizationId, auth.organization.id)
        )
      )
      .limit(1);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const appointment = await withAppointmentLock(auth.organization.id, input.professionalId, async (tx) => {
      if (input.professionalId) {
        const available = await isTimeAvailable({
          organizationId: auth.organization.id, timezone: auth.organization.timezone,
          date: organizationDate(input.startsAt, auth.organization.timezone),
          serviceId: input.serviceId, professionalId: input.professionalId,
          slotIntervalMinutes: auth.organization.slotIntervalMinutes,
          startsAt: input.startsAt,
        });
        if (!available) throw new Error("O horário selecionado não está disponível.");
      }
      const [created] = await tx.insert(appointments).values({
        organizationId: auth.organization.id, clientId: input.clientId,
        serviceId: input.serviceId, professionalId: input.professionalId,
        startsAt: input.startsAt,
        endsAt: new Date(input.startsAt.getTime() + service.durationMinutes * 60_000),
        priceInCents: service.priceInCents, notes: input.notes, source: "whatsapp",
      }).returning();
      return created;
    });
    if (input.clientPackageId) {
      try {
        await reservePackageSession({
          appointmentId: appointment.id,
          organizationId: auth.organization.id,
          clientId: input.clientId,
          serviceId: input.serviceId,
          clientPackageId: input.clientPackageId,
        });
        await db.update(appointments).set({ priceInCents: 0 }).where(eq(appointments.id, appointment.id));
      } catch (error) {
        await db.delete(appointments).where(eq(appointments.id, appointment.id));
        throw error;
      }
    }
    await syncAppointmentFinancialEntry(appointment.id);
    await syncAppointmentToGoogleCalendar(appointment.id);
    return NextResponse.json({
      timezone: auth.organization.timezone,
      appointment: {
        ...appointment,
        startsAtLocal: formatOrganizationDateTime(appointment.startsAt, auth.organization.timezone),
        endsAtLocal: formatOrganizationDateTime(appointment.endsAt, auth.organization.timezone),
      },
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
