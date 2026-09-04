import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { professionals } from "@/db/schema";
import {
  exchangeGoogleCalendarCode,
  hasGoogleCalendarEventsScope,
  parseGoogleCalendarAuthorizationState,
  upsertProfessionalGoogleCalendarAccount,
} from "@/lib/google-calendar";
import { requireOrganization } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    const { organization } = await requireOrganization();
    const error = request.nextUrl.searchParams.get("error");
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    if (error || !code || !state) throw new Error(error || "Retorno OAuth incompleto.");

    const parsed = parseGoogleCalendarAuthorizationState(state);
    if (parsed.organizationId !== organization.id) {
      throw new Error("A organização da autorização não corresponde à sessão.");
    }
    const [professional] = await db
      .select({ id: professionals.id })
      .from(professionals)
      .where(
        and(
          eq(professionals.id, parsed.professionalId),
          eq(professionals.organizationId, organization.id)
        )
      )
      .limit(1);
    if (!professional) throw new Error("Profissional não encontrado.");

    const tokens = await exchangeGoogleCalendarCode(code);
    if (!hasGoogleCalendarEventsScope(tokens.scope)) {
      throw new Error("A permissão para eventos do Google Agenda não foi concedida.");
    }
    await upsertProfessionalGoogleCalendarAccount({
      professionalId: professional.id,
      organizationId: organization.id,
      tokens,
    });
    revalidatePath("/equipe");
    return NextResponse.redirect(new URL("/equipe?googleCalendar=connected", request.url));
  } catch (error) {
    console.error("Falha no retorno do Google Calendar", error);
    return NextResponse.redirect(new URL("/equipe?googleCalendar=error", request.url));
  }
}
