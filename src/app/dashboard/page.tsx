import { AppShell } from "@/components/app-shell";
import { DashboardView } from "@/components/dashboard-view";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  return <AppShell><DashboardView /></AppShell>;
}

/* Legacy dashboard retained temporarily for migration reference.
import { and, count, eq, gte, inArray, lt } from "drizzle-orm";
import { CalendarDays, Clock3, UsersRound, Wrench } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { appointments, clients, professionals, services, weeklyAvailability } from "@/db/schema";
import { requireOrganization, requireProfessionalScope } from "@/lib/session";
import { formatOrganizationDateTime, organizationDayRange } from "@/lib/appointment-safety";

export const metadata = { title: "Agenda" };

const statusLabel = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  completed: "Concluído",
  no_show: "Não compareceu",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ compra?: string }>;
}) {
  const { session, organization } = await requireOrganization();
  const professionalScopeId = organization.role === "professional"
    ? await requireProfessionalScope(organization.id, session.user.id)
    : null;
  const purchaseConfirmed = (await searchParams).compra === "sucesso";
  const { start, end } = organizationDayRange(new Date(), organization.timezone);

  const [[clientTotal], [professionalTotal], [serviceTotal], [todayAppointmentTotal], [allAppointmentTotal], [availabilityTotal], next] =
    await Promise.all([
      db.select({ value: count() }).from(clients).where(and(eq(clients.organizationId, organization.id), professionalScopeId ? inArray(clients.id, db.select({ id: appointments.clientId }).from(appointments).where(and(eq(appointments.organizationId, organization.id), eq(appointments.professionalId, professionalScopeId)))) : undefined)),
      db.select({ value: count() }).from(professionals).where(and(eq(professionals.organizationId, organization.id), professionalScopeId ? eq(professionals.id, professionalScopeId) : undefined)),
      db.select({ value: count() }).from(services).where(eq(services.organizationId, organization.id)),
      db.select({ value: count() }).from(appointments).where(and(eq(appointments.organizationId, organization.id), gte(appointments.startsAt, start), lt(appointments.startsAt, end), professionalScopeId ? eq(appointments.professionalId, professionalScopeId) : undefined)),
      db.select({ value: count() }).from(appointments).where(and(eq(appointments.organizationId, organization.id), professionalScopeId ? eq(appointments.professionalId, professionalScopeId) : undefined)),
      db.select({ value: count() }).from(weeklyAvailability).where(and(eq(weeklyAvailability.organizationId, organization.id), professionalScopeId ? eq(weeklyAvailability.professionalId, professionalScopeId) : undefined)),
      db.select({
        id: appointments.id,
        startsAt: appointments.startsAt,
        status: appointments.status,
        client: clients.name,
        service: services.name,
      }).from(appointments)
        .innerJoin(clients, eq(clients.id, appointments.clientId))
        .innerJoin(services, eq(services.id, appointments.serviceId))
        .where(and(eq(appointments.organizationId, organization.id), gte(appointments.startsAt, start), professionalScopeId ? eq(appointments.professionalId, professionalScopeId) : undefined))
        .orderBy(appointments.startsAt)
        .limit(6),
    ]);
  const onboarding = [
    { done: professionalTotal.value > 0, label: `Cadastrar ${organization.professionalLabel.toLowerCase()}`, href: "/profissionais" },
    { done: serviceTotal.value > 0, label: `Cadastrar ${organization.serviceLabel.toLowerCase()}`, href: "/servicos" },
    { done: availabilityTotal.value > 0, label: "Definir disponibilidade", href: "/disponibilidade" },
    { done: organization.bookingEnabled, label: "Publicar agendamento online", href: "/configuracoes" },
    { done: allAppointmentTotal.value > 0, label: `Realizar primeiro ${organization.appointmentLabel.toLowerCase()}`, href: "/agendamentos" },
  ];
  const completedOnboarding = onboarding.filter((item) => item.done).length;

  return (
    <AppShell>
      <div className="page-wrap">
        <PageHeader
          eyebrow={organization.name}
          title={`Olá, ${session.user.name.split(" ")[0]}.`}
          description="Acompanhe o movimento do seu negócio e os próximos atendimentos."
        />
        {purchaseConfirmed && (
          <section className="mb-5 rounded-2xl border border-brand/20 bg-[#edf7f1] p-5 text-brand">
            <p className="font-extrabold">Pagamento confirmado — bem-vindo ao Aggenda!</p>
            <p className="mt-1 text-sm font-medium">
              Seu acesso está liberado. Use a implantação guiada para conectar o WhatsApp e preparar o serviço contratado.
            </p>
            <Link className="mt-3 inline-flex text-sm font-extrabold underline" href="/implantacao">Iniciar implantação →</Link>
          </section>
        )}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              icon: CalendarDays,
              value: todayAppointmentTotal.value,
              label: `${organization.appointmentLabelPlural} hoje`,
            },
            {
              icon: UsersRound,
              value: clientTotal.value,
              label: organization.clientLabelPlural,
            },
            {
              icon: Clock3,
              value: professionalTotal.value,
              label: organization.professionalLabelPlural,
            },
            {
              icon: Wrench,
              value: serviceTotal.value,
              label: organization.serviceLabelPlural,
            },
          ].map(({ icon: Icon, value, label }) => (
            <article key={label} className="panel">
              <Icon className="size-5 text-brand" />
              <p className="mt-7 text-3xl font-extrabold">{value}</p>
              <p className="mt-1 text-sm text-muted">{label}</p>
            </article>
          ))}
        </section>
        {!professionalScopeId && completedOnboarding < onboarding.length && (
          <section className="panel mt-5 border-brand/20 bg-[#f7fff9]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-widest text-brand">
                  Preparação da conta
                </p>
                <h2 className="mt-1 text-xl font-extrabold">
                  {completedOnboarding} de {onboarding.length} etapas concluídas
                </h2>
              </div>
              <span className="status-pill">
                {Math.round((completedOnboarding / onboarding.length) * 100)}%
              </span>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {onboarding.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="rounded-xl border bg-white p-3 text-sm font-bold transition hover:border-brand"
                >
                  <span className={item.done ? "text-brand" : "text-muted"}>
                    {item.done ? "✓" : "○"} {item.label}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
        <section className="panel mt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold">
              Próximos {organization.appointmentLabelPlural.toLowerCase()}
            </h2>
            <Link className="text-sm font-bold text-brand" href="/agendamentos">Ver agenda</Link>
          </div>
          <div className="mt-5 divide-y">
            {next.length ? next.map((item) => (
              <div key={item.id} className="grid gap-2 py-4 sm:grid-cols-[100px_1fr_auto] sm:items-center">
                <span className="font-extrabold text-brand">
                  {formatOrganizationDateTime(item.startsAt, organization.timezone, { year: undefined })}
                </span>
                <div><p className="font-bold">{item.client}</p><p className="text-sm text-muted">{item.service}</p></div>
                <span className="status-pill">{statusLabel[item.status]}</span>
              </div>
            )) : (
              <p className="py-10 text-center text-muted">
                Nenhum {organization.appointmentLabel.toLowerCase()} futuro ainda.
              </p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
*/
