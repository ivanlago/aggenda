import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { professionals } from "@/db/schema";
import { getGoogleCalendarAuthorizationUrl } from "@/lib/google-calendar";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export async function GET(request: NextRequest) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "professionals.manage");
  const professionalId = request.nextUrl.searchParams.get("professionalId");
  if (!professionalId) {
    return NextResponse.redirect(new URL("/equipe?googleCalendar=invalid", request.url));
  }
  const [professional] = await db
    .select({ id: professionals.id })
    .from(professionals)
    .where(
      and(
        eq(professionals.id, professionalId),
        eq(professionals.organizationId, organization.id)
      )
    )
    .limit(1);
  if (!professional) {
    return NextResponse.redirect(new URL("/equipe?googleCalendar=invalid", request.url));
  }
  return NextResponse.redirect(
    getGoogleCalendarAuthorizationUrl({
      professionalId,
      organizationId: organization.id,
    })
  );
}
