import { and, eq } from "drizzle-orm";
import { CalendarCheck, MapPin } from "lucide-react";
import Image from "next/image";
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
        priceInCents: services.priceInCents,
        depositType: services.depositType,
        depositValue: services.depositValue,
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
    <main className="grid min-h-screen place-items-center p-5" style={{ background: `linear-gradient(145deg, ${organization.brandColor}18, #f3f5f1 55%)` }}>
      <section className="panel w-full max-w-xl shadow-xl shadow-brand/5">
        {organization.publicCoverUrl && <Image className="mb-5 h-44 w-full rounded-2xl object-cover" src={organization.publicCoverUrl} alt={`Capa de ${organization.name}`} width={900} height={360} unoptimized />}
        <div className="flex items-center gap-3">
          {organization.publicLogoUrl ? <Image className="size-14 rounded-xl object-contain" src={organization.publicLogoUrl} alt={`Logo de ${organization.name}`} width={56} height={56} unoptimized /> : <span className="grid size-11 place-items-center rounded-xl bg-accent text-brand-dark"><CalendarCheck className="size-5" /></span>}
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-brand">
              Agendamento online
            </p>
            <h1 className="text-2xl font-extrabold">{organization.name}</h1>
          </div>
        </div>
        {organization.publicDescription && <p className="mt-4 text-sm leading-6 text-muted">{organization.publicDescription}</p>}
        {organization.publicAddress && <p className="mt-3 flex items-center gap-2 text-sm font-bold"><MapPin className="size-4" />{organization.publicAddress}</p>}
        <BookingForm
          slug={slug}
          services={serviceItems}
          professionals={professionalItems}
          timezone={organization.timezone}
          labels={{
            service: organization.serviceLabel,
            professional: organization.professionalLabel,
            appointment: organization.appointmentLabel,
          }}
        />
        {[organization.cancellationPolicy, organization.depositRefundPolicy, organization.latenessPolicy, organization.publicPrivacyPolicy].some(Boolean) && <details className="mt-5 rounded-2xl border p-4 text-sm"><summary className="cursor-pointer font-extrabold">Políticas de agendamento</summary><div className="mt-3 grid gap-3 text-muted">{organization.cancellationPolicy && <p><strong className="text-foreground">Cancelamento:</strong> {organization.cancellationPolicy}</p>}{organization.depositRefundPolicy && <p><strong className="text-foreground">Sinal:</strong> {organization.depositRefundPolicy}</p>}{organization.latenessPolicy && <p><strong className="text-foreground">Atrasos e ausências:</strong> {organization.latenessPolicy}</p>}{organization.publicPrivacyPolicy && <p><strong className="text-foreground">Privacidade:</strong> {organization.publicPrivacyPolicy}</p>}</div></details>}
        <p className="mt-6 text-center text-xs text-muted">Agendamento seguro por Aggenda</p>
      </section>
    </main>
  );
}
