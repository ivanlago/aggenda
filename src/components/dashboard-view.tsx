import { and, count, eq, gte, inArray, lt } from "drizzle-orm";
import { CalendarDays, Clock3, UsersRound, Wrench } from "lucide-react";
import Link from "next/link";

import { db } from "@/db";
import { appointments, clients, professionals, services } from "@/db/schema";
import { formatOrganizationDateTime, organizationDayRange } from "@/lib/appointment-safety";
import { requireOrganization, requireProfessionalScope } from "@/lib/session";

import { PageHeader } from "./page-header";

const statusLabels: Record<string, string> = { scheduled: "Agendado", confirmed: "Confirmado", completed: "Concluído", cancelled: "Cancelado", no_show: "Não compareceu" };

export async function DashboardView() {
  const { session, organization } = await requireOrganization();
  const scopeId = organization.role === "professional" ? await requireProfessionalScope(organization.id, session.user.id) : null;
  const { start, end } = organizationDayRange(new Date(), organization.timezone);
  const appointmentScope = scopeId ? eq(appointments.professionalId, scopeId) : undefined;
  const [[todayCount], [clientCount], [professionalCount], [serviceCount], upcoming] = await Promise.all([
    db.select({ value: count() }).from(appointments).where(and(eq(appointments.organizationId, organization.id), gte(appointments.startsAt, start), lt(appointments.startsAt, end), appointmentScope)),
    db.select({ value: count() }).from(clients).where(and(eq(clients.organizationId, organization.id), scopeId ? inArray(clients.id, db.select({ id: appointments.clientId }).from(appointments).where(and(eq(appointments.organizationId, organization.id), appointmentScope))) : undefined)),
    db.select({ value: count() }).from(professionals).where(and(eq(professionals.organizationId, organization.id), scopeId ? eq(professionals.id, scopeId) : undefined)),
    db.select({ value: count() }).from(services).where(eq(services.organizationId, organization.id)),
    db.select({ id: appointments.id, startsAt: appointments.startsAt, status: appointments.status, client: clients.name, service: services.name, professional: professionals.name }).from(appointments).innerJoin(clients, eq(clients.id, appointments.clientId)).innerJoin(services, eq(services.id, appointments.serviceId)).leftJoin(professionals, eq(professionals.id, appointments.professionalId)).where(and(eq(appointments.organizationId, organization.id), gte(appointments.startsAt, start), appointmentScope)).orderBy(appointments.startsAt).limit(8),
  ]);
  const cards = [
    { icon: CalendarDays, value: todayCount.value, label: "Atendimentos hoje" },
    { icon: UsersRound, value: clientCount.value, label: organization.clientLabelPlural },
    { icon: Clock3, value: professionalCount.value, label: organization.professionalLabelPlural },
    { icon: Wrench, value: serviceCount.value, label: organization.serviceLabelPlural },
  ];
  return <div className="page-wrap">
    <PageHeader eyebrow={organization.name} title={`Olá, ${session.user.name.split(" ")[0]}.`} description="Acompanhe o movimento do negócio e os próximos atendimentos." />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ icon: Icon, value, label }) => <article className="panel" key={label}><Icon className="size-5 text-brand" /><p className="mt-7 text-3xl font-extrabold">{value}</p><p className="mt-1 text-sm text-muted">{label}</p></article>)}</section>
    <section className="panel mt-5"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-extrabold">Próximos atendimentos</h2><Link className="text-sm font-extrabold text-brand" href="/agenda">Ver agenda</Link></div><div className="mt-4 divide-y">{upcoming.map((item) => <article className="grid gap-2 py-4 sm:grid-cols-[150px_1fr_auto] sm:items-center" key={item.id}><p className="font-extrabold text-brand">{formatOrganizationDateTime(item.startsAt, organization.timezone)}</p><div><p className="font-extrabold">{item.client}</p><p className="text-sm text-muted">{item.service}{item.professional ? ` · ${item.professional}` : ""}</p></div><span className="status-pill w-fit">{statusLabels[item.status] ?? item.status}</span></article>)}{!upcoming.length && <p className="empty-state">Nenhum atendimento futuro.</p>}</div></section>
  </div>;
}
