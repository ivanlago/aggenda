import { count, eq, gte, min, sql } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db";
import { appointments, clients, organizations, services, users } from "@/db/schema";
import { requirePlatformMember } from "@/lib/session";

export const metadata = { title: "Administração SaaS" };

export default async function PlatformAdminPage() {
  await requirePlatformMember();
  const recentCompanies = db.$with("recent_companies").as(
    db.select({
      id: organizations.id,
      createdAt: organizations.createdAt,
      publishedAt: organizations.bookingFirstPublishedAt,
    }).from(organizations).where(gte(organizations.createdAt, sql`(now() at time zone 'UTC') - interval '30 days'`))
  );
  const firstAppointments = db.$with("first_appointments").as(
    db.select({
      organizationId: appointments.organizationId,
      firstAt: min(appointments.createdAt).as("first_at"),
    }).from(appointments).innerJoin(recentCompanies, eq(appointments.organizationId, recentCompanies.id))
      .groupBy(appointments.organizationId)
  );
  const [[companyCount], [userCount], [clientCount], [serviceCount], [activation]] = await Promise.all([
    db.select({ value: count() }).from(organizations),
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(clients),
    db.select({ value: count() }).from(services),
    db.with(recentCompanies, firstAppointments).select({
      total: count(),
      scheduled: count(firstAppointments.firstAt),
      published: count(recentCompanies.publishedAt),
      schedulingHours: sql<number | null>`avg(extract(epoch from (${firstAppointments.firstAt} - ${recentCompanies.createdAt})) / 3600)::float8`,
      publishingHours: sql<number | null>`avg(extract(epoch from (${recentCompanies.publishedAt} - ${recentCompanies.createdAt})) / 3600)::float8`,
    }).from(recentCompanies).leftJoin(firstAppointments, eq(recentCompanies.id, firstAppointments.organizationId)),
  ]);
  const cards = [
    ["Empresas", companyCount.value, "/admin/empresas"],
    ["Usuários", userCount.value, "/admin/usuarios"],
    ["Clientes finais — consultar por empresa", clientCount.value, "/admin/empresas"],
    ["Procedimentos — consultar por empresa", serviceCount.value, "/admin/empresas"],
  ] as const;
  const hours = (value: number | null) => value === null ? "Sem dados" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
  return (
    <div>
      <p className="text-xs font-extrabold uppercase tracking-widest text-brand">Plataforma</p>
      <h1 className="mt-2 text-3xl font-extrabold">Administração do SaaS</h1>
      <p className="mt-2 text-muted">Visão global separada das permissões de cada empresa.</p>
      <Link href="/plataforma/convites-piloto" className="primary-button mt-5 inline-flex">Convites do piloto anual de R$ 5,00</Link>
      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {cards.map(([label, value, href]) => (
          <Link className="panel" href={href} key={label}>
            <p className="text-sm font-bold text-muted">{label}</p>
            <p className="mt-3 text-3xl font-extrabold">{value}</p>
          </Link>
        ))}
      </div>
      <section className="panel mt-6" aria-labelledby="activation-title">
        <h2 id="activation-title" className="text-xl font-extrabold">Primeiros passos das novas empresas</h2>
        <p className="mt-2 text-sm text-muted">Empresas cadastradas nos últimos 30 dias. Os tempos são médias entre as empresas que concluíram cada etapa.</p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><dt className="font-bold">Primeiro agendamento</dt><dd>{activation.scheduled} de {activation.total} empresas · {hours(activation.schedulingHours)}</dd></div>
          <div><dt className="font-bold">Primeira publicação registrada do link</dt><dd>{activation.published} de {activation.total} empresas · {hours(activation.publishingHours)}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-muted">A data do link é registrada quando a página pública é ativada. A métrica começa com a disponibilização deste recurso.</p>
      </section>
    </div>
  );
}
