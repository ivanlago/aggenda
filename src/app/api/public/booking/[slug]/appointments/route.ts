import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  appointments,
  clients,
  organizations,
  professionals,
  services,
} from "@/db/schema";
import { isTimeAvailable } from "@/lib/availability";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  const phone = String(body.phone ?? "").replace(/\D/g, "");
  const email = String(body.email ?? "").trim() || null;
  const serviceId = String(body.serviceId ?? "");
  const professionalId = String(body.professionalId ?? "");
  const startsAt = new Date(String(body.startsAt ?? ""));
  if (name.length < 2 || phone.length < 10 || Number.isNaN(startsAt.getTime())) {
    return Response.json({ error: "Preencha nome, telefone e horário." }, { status: 400 });
  }
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
  const [[service], [professional]] = await Promise.all([
    db
      .select({ duration: services.durationMinutes, price: services.priceInCents })
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
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: organization.timezone,
  }).format(startsAt);
  const available = await isTimeAvailable({
    organizationId: organization.id,
    timezone: organization.timezone,
    date,
    serviceId,
    professionalId,
    slotIntervalMinutes: organization.slotIntervalMinutes,
    noticeHours: organization.bookingNoticeHours,
    startsAt,
  });
  if (!available) {
    return Response.json(
      { error: "Este horário acabou de ficar indisponível. Escolha outro." },
      { status: 409 }
    );
  }

  try {
    const appointment = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(
          and(
            eq(clients.organizationId, organization.id),
            eq(clients.phone, phone)
          )
        )
        .limit(1);
      let clientId = existing?.id;
      if (!clientId) {
        const [created] = await tx
          .insert(clients)
          .values({ organizationId: organization.id, name, phone, email })
          .returning({ id: clients.id });
        clientId = created.id;
      }
      const [created] = await tx
        .insert(appointments)
        .values({
          organizationId: organization.id,
          clientId,
          serviceId,
          professionalId,
          startsAt,
          endsAt: new Date(startsAt.getTime() + service.duration * 60_000),
          priceInCents: service.price,
          source: "booking_page",
        })
        .returning({ id: appointments.id });
      return created;
    });
    return Response.json({ id: appointment.id }, { status: 201 });
  } catch {
    return Response.json(
      { error: "Não foi possível concluir o agendamento." },
      { status: 500 }
    );
  }
}
