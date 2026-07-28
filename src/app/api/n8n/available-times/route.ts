import { and, eq, gte, lt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { appointments, services } from "@/db/schema";
import { requireN8nOrganization } from "@/lib/n8n-api";

export async function GET(request: NextRequest) {
  const auth = await requireN8nOrganization(request);
  if ("error" in auth) return auth.error;

  const date = request.nextUrl.searchParams.get("date");
  const serviceId = request.nextUrl.searchParams.get("serviceId");
  const professionalId = request.nextUrl.searchParams.get("professionalId");
  if (!date || !serviceId) {
    return NextResponse.json(
      { error: "date and serviceId are required" },
      { status: 400 }
    );
  }

  const [service] = await db.select({ duration: services.durationMinutes })
    .from(services)
    .where(and(
      eq(services.id, serviceId),
      eq(services.organizationId, auth.organization.id)
    ))
    .limit(1);
  if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });

  const dayStart = new Date(`${date}T00:00:00-03:00`);
  const dayEnd = new Date(`${date}T23:59:59-03:00`);
  if (Number.isNaN(dayStart.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const conditions = [
    eq(appointments.organizationId, auth.organization.id),
    gte(appointments.startsAt, dayStart),
    lt(appointments.startsAt, dayEnd),
  ];
  if (professionalId) conditions.push(eq(appointments.professionalId, professionalId));

  const busy = await db.select({
    startsAt: appointments.startsAt,
    endsAt: appointments.endsAt,
  }).from(appointments).where(and(...conditions));

  const slots: string[] = [];
  for (let minutes = 9 * 60; minutes + service.duration <= 18 * 60; minutes += 30) {
    const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
    const minute = String(minutes % 60).padStart(2, "0");
    const start = new Date(`${date}T${hour}:${minute}:00-03:00`);
    const end = new Date(start.getTime() + service.duration * 60_000);
    const overlaps = busy.some((item) => start < item.endsAt && end > item.startsAt);
    if (!overlaps) slots.push(start.toISOString());
  }

  return NextResponse.json({
    date,
    timezone: auth.organization.timezone,
    serviceId,
    professionalId,
    availableTimes: slots,
  });
}
