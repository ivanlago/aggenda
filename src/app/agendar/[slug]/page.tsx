import { and, eq } from "drizzle-orm";
import { CalendarCheck } from "lucide-react";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { organizations, professionals, services } from "@/db/schema";

import { BookingForm } from "./booking-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [organization] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  return { title: organization ? `Agendar · ${organization.name}` : "Agendamento" };
}

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [organization] = await db
    .select()
    .from(organizations)
    .where(
      and(eq(organizations.slug, slug), eq(organizations.bookingEnabled, true))
    )
    .limit(1);
  if (!organization) notFound();
  const [serviceItems, professionalItems] = await Promise.all([
    db
      .select({
        id: services.id,
        name: services.name,
        durationMinutes: services.durationMinutes,
      })
      .from(services)
      .where(
        and(
          eq(services.organizationId, organization.id),
          eq(services.isActive, true)
        )
      )
      .orderBy(services.name),
    db
      .select({ id: professionals.id, name: professionals.name })
      .from(professionals)
      .where(
        and(
          eq(professionals.organizationId, organization.id),
          eq(professionals.isActive, true),
          eq(professionals.isBookable, true)
        )
      )
      .orderBy(professionals.name),
  ]);
  return (
    <main className="grid min-h-screen place-items-center p-5">
      <section className="panel w-full max-w-xl shadow-xl shadow-brand/5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-accent text-brand-dark">
            <CalendarCheck className="size-5" />
          </span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-brand">
              Agendamento online
            </p>
            <h1 className="text-2xl font-extrabold">{organization.name}</h1>
          </div>
        </div>
        <BookingForm
          slug={slug}
          services={serviceItems}
          professionals={professionalItems}
          labels={{
            service: organization.serviceLabel,
            professional: organization.professionalLabel,
            appointment: organization.appointmentLabel,
          }}
        />
        <p className="mt-6 text-center text-xs text-muted">Agendamento seguro por Aggenda</p>
      </section>
    </main>
  );
}
