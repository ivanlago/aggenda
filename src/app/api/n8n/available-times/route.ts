import { NextRequest, NextResponse } from "next/server";

import { getAvailableTimes } from "@/lib/availability";
import { requireN8nOrganization } from "@/lib/n8n-api";

const DEFAULT_SEARCH_DAYS = 60;
const MAX_SEARCH_DAYS = 90;

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(value.getTime())) return null;
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const auth = await requireN8nOrganization(request);
  if ("error" in auth) return auth.error;
  const date = request.nextUrl.searchParams.get("date");
  const serviceId = request.nextUrl.searchParams.get("serviceId");
  const professionalId = request.nextUrl.searchParams.get("professionalId");
  const findNext = request.nextUrl.searchParams.get("findNext") === "true";
  const requestedSearchDays = Number(
    request.nextUrl.searchParams.get("searchDays") ?? DEFAULT_SEARCH_DAYS
  );
  const searchDays = Number.isFinite(requestedSearchDays)
    ? Math.min(Math.max(Math.trunc(requestedSearchDays), 0), MAX_SEARCH_DAYS)
    : DEFAULT_SEARCH_DAYS;
  if (!date || !serviceId || !professionalId) {
    return NextResponse.json(
      { error: "date, serviceId and professionalId are required" },
      { status: 400 }
    );
  }
  let availableDate = date;
  let times: string[] | null = null;

  for (let offset = 0; offset <= (findNext ? searchDays : 0); offset += 1) {
    const candidateDate = addDays(date, offset);
    if (!candidateDate) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
    const candidateTimes = await getAvailableTimes({
      organizationId: auth.organization.id,
      timezone: auth.organization.timezone,
      date: candidateDate,
      serviceId,
      professionalId,
    });
    if (candidateTimes === null) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }
    availableDate = candidateDate;
    times = candidateTimes;
    if (times.length > 0) break;
  }

  return NextResponse.json({
    requestedDate: date,
    date: availableDate,
    foundNextDate: availableDate !== date && Boolean(times?.length),
    timezone: auth.organization.timezone,
    serviceId,
    professionalId,
    availableTimes: times ?? [],
  });
}
