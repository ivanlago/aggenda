import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { appointments, services } from "@/db/schema";
import { apiError, requireN8nOrganization } from "@/lib/n8n-api";
import { isTimeAvailable } from "@/lib/availability";
import { organizationDate, withAppointmentLock } from "@/lib/appointment-safety";

const patchSchema = z.object({
  startsAt: z.coerce.date().optional(),
  status: z.enum(["scheduled", "confirmed", "cancelled", "completed", "no_show"]).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireN8nOrganization(request);
    if ("error" in auth) return auth.error;
    const { id } = await params;
    const input = patchSchema.parse(await request.json());

    const [current] = await db.select({
      serviceId: appointments.serviceId,
      startsAt: appointments.startsAt,
      professionalId: appointments.professionalId,
    }).from(appointments).where(and(
      eq(appointments.id, id),
      eq(appointments.organizationId, auth.organization.id)
    )).limit(1);
    if (!current) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });

    const appointment = await withAppointmentLock(auth.organization.id, current.professionalId, async (tx) => {
      let endsAt: Date | undefined;
      if (input.startsAt) {
        const [service] = await db.select({ duration: services.durationMinutes })
          .from(services).where(eq(services.id, current.serviceId)).limit(1);
        if (current.professionalId) {
          const available = await isTimeAvailable({
            organizationId: auth.organization.id, timezone: auth.organization.timezone,
            date: organizationDate(input.startsAt, auth.organization.timezone),
            serviceId: current.serviceId, professionalId: current.professionalId,
            slotIntervalMinutes: auth.organization.slotIntervalMinutes,
            excludeAppointmentId: id, startsAt: input.startsAt,
          });
          if (!available) throw new Error("O horário selecionado não está disponível.");
        }
        endsAt = new Date(input.startsAt.getTime() + service.duration * 60_000);
      }
      const [updated] = await tx.update(appointments).set({
        startsAt: input.startsAt, endsAt, status: input.status,
        confirmedAt: input.status === "confirmed" ? new Date() : undefined,
        updatedAt: new Date(),
      }).where(and(eq(appointments.id, id), eq(appointments.organizationId, auth.organization.id))).returning();
      return updated;
    });
    return NextResponse.json({ appointment });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireN8nOrganization(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const [appointment] = await db.update(appointments).set({
    status: "cancelled",
    updatedAt: new Date(),
  }).where(and(
    eq(appointments.id, id),
    eq(appointments.organizationId, auth.organization.id)
  )).returning();
  if (!appointment) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  return NextResponse.json({ appointment });
}
