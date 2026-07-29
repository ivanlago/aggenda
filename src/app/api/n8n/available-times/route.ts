import { NextRequest, NextResponse } from "next/server";

import { getAvailableTimes } from "@/lib/availability";
import { requireN8nOrganization } from "@/lib/n8n-api";

export async function GET(request: NextRequest) {
  const auth = await requireN8nOrganization(request);
  if ("error" in auth) return auth.error;
  const date = request.nextUrl.searchParams.get("date");
  const serviceId = request.nextUrl.searchParams.get("serviceId");
  const professionalId = request.nextUrl.searchParams.get("professionalId");
  if (!date || !serviceId || !professionalId) {
    return NextResponse.json(
      { error: "date, serviceId and professionalId are required" },
      { status: 400 }
    );
  }
  const times = await getAvailableTimes({
    organizationId: auth.organization.id,
    timezone: auth.organization.timezone,
    date,
    serviceId,
    professionalId,
  });
  if (times === null) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }
  return NextResponse.json({
    date,
    timezone: auth.organization.timezone,
    serviceId,
    professionalId,
    availableTimes: times,
  });
}
