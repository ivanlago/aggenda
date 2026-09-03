import { NextRequest } from "next/server";

import { getAvailableTimes } from "@/lib/availability";
import { requireOrganization, requireProfessionalScope } from "@/lib/session";

export async function GET(request: NextRequest) {
  const { session, organization } = await requireOrganization();
  const date = request.nextUrl.searchParams.get("date");
  const serviceId = request.nextUrl.searchParams.get("serviceId");
  const professionalId = request.nextUrl.searchParams.get("professionalId");
  const excludeAppointmentId = request.nextUrl.searchParams.get("excludeAppointmentId") ?? undefined;
  if (!date || !serviceId || !professionalId) {
    return Response.json({ error: "Selecione serviço, profissional e data." }, { status: 400 });
  }
  if (organization.role === "professional" && professionalId !== await requireProfessionalScope(organization.id, session.user.id)) return Response.json({ error: "Você só pode consultar a própria disponibilidade." }, { status: 403 });
  const times = await getAvailableTimes({
    organizationId: organization.id,
    timezone: organization.timezone,
    date,
    serviceId,
    professionalId,
    excludeAppointmentId,
    slotIntervalMinutes: organization.slotIntervalMinutes,
  });
  if (times === null) return Response.json({ error: "Serviço não encontrado." }, { status: 404 });
  return Response.json({ availableTimes: times });
}
