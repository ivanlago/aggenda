import { and, eq, gte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { appointments, clients, professionals, services } from "@/db/schema";
import { apiError, requireN8nOrganization } from "@/lib/n8n-api";

const inputSchema = z.object({
  clientId: z.string().uuid(),
  serviceId: z.string().uuid(),
  professionalId: z.string().uuid().optional().nullable(),
  startsAt: z.coerce.date(),
  notes: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const auth = await requireN8nOrganization(request);
  if ("error" in auth) return auth.error;

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
    .where(and(
      eq(appointments.organizationId, auth.organization.id),
      gte(appointments.startsAt, new Date())
    ))
    .orderBy(appointments.startsAt);

  return NextResponse.json({ appointments: items });
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

    const [appointment] = await db.insert(appointments).values({
      organizationId: auth.organization.id,
      clientId: input.clientId,
      serviceId: input.serviceId,
      professionalId: input.professionalId,
      startsAt: input.startsAt,
      endsAt: new Date(input.startsAt.getTime() + service.durationMinutes * 60_000),
      priceInCents: service.priceInCents,
      notes: input.notes,
      source: "whatsapp",
    }).returning();
    return NextResponse.json({ appointment }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
