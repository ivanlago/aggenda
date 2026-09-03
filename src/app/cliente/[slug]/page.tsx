import { randomBytes } from "node:crypto";

import { and, desc, eq, gt } from "drizzle-orm";
import { CalendarCheck, Mail, Phone } from "lucide-react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { AppointmentSelfService } from "@/app/agendamento/[token]/self-service";
import { db } from "@/db";
import { appointments, clientPortalSessions, clients, organizations, professionals, services } from "@/db/schema";
import { formatOrganizationDateTime } from "@/lib/appointment-safety";
import { CLIENT_CHALLENGE_COOKIE, CLIENT_PORTAL_COOKIE, portalHash } from "@/lib/client-portal";

import { PortalLogin, PortalLogout } from "./portal-login";

const statusLabels = { scheduled: "Agendado", confirmed: "Confirmado", cancelled: "Cancelado", completed: "Concluído", no_show: "Não compareceu" };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [organization] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.slug, slug)).limit(1);
  return { title: organization ? `Área do cliente · ${organization.name}` : "Área do cliente" };
}

export default async function ClientPortalPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ erro?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const [organization] = await db.select().from(organizations).where(and(eq(organizations.slug, slug), eq(organizations.bookingEnabled, true))).limit(1);
  if (!organization) notFound();
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(CLIENT_PORTAL_COOKIE)?.value;
  const [identity] = sessionToken ? await db.select({ sessionId: clientPortalSessions.id, clientId: clients.id, name: clients.name, email: clients.email, phone: clients.phone })
    .from(clientPortalSessions).innerJoin(clients, eq(clients.id, clientPortalSessions.clientId))
    .where(and(eq(clientPortalSessions.organizationId, organization.id), eq(clientPortalSessions.tokenHash, portalHash(sessionToken)), gt(clientPortalSessions.expiresAt, new Date()))).limit(1) : [];

  if (!identity) return <main className="grid min-h-screen place-items-center p-5" style={{ background: `linear-gradient(145deg, ${organization.brandColor}18, #f3f5f1 55%)` }}><section className="panel w-full max-w-md shadow-xl shadow-brand/5"><Header name={organization.name} /><h1 className="mt-6 text-2xl font-extrabold">Área do cliente</h1><p className="mt-2 text-sm leading-6 text-muted">Entre sem senha. Enviaremos ao seu e-mail um link seguro e um código temporário.</p><PortalLogin slug={slug} hasChallenge={Boolean(cookieStore.get(CLIENT_CHALLENGE_COOKIE))} expiredLink={query.erro === "link-expirado"} /><div className="mt-6 border-t pt-5 text-center"><a className="font-extrabold text-brand" href={`/agendar/${slug}`}>Fazer novo agendamento →</a></div></section></main>;

  await db.update(clientPortalSessions).set({ lastUsedAt: new Date() }).where(eq(clientPortalSessions.id, identity.sessionId));
  const items = await db.select({ id: appointments.id, startsAt: appointments.startsAt, status: appointments.status, token: appointments.publicManageToken, service: services.name, professional: professionals.name })
    .from(appointments).innerJoin(services, eq(services.id, appointments.serviceId)).leftJoin(professionals, eq(professionals.id, appointments.professionalId))
    .where(and(eq(appointments.organizationId, organization.id), eq(appointments.clientId, identity.clientId))).orderBy(desc(appointments.startsAt));
  for (const item of items) {
    if (!item.token) {
      item.token = randomBytes(32).toString("base64url");
      await db.update(appointments).set({ publicManageToken: item.token }).where(and(eq(appointments.id, item.id), eq(appointments.clientId, identity.clientId)));
    }
  }
  const upcoming = items.filter((item) => item.startsAt >= new Date() && !["cancelled", "completed", "no_show"].includes(item.status));
  const history = items.filter((item) => !upcoming.includes(item));
  return <main className="min-h-screen p-5 sm:p-8" style={{ background: `linear-gradient(145deg, ${organization.brandColor}18, #f3f5f1 55%)` }}><div className="mx-auto grid max-w-4xl gap-5">
    <section className="panel"><div className="flex flex-wrap items-center justify-between gap-4"><Header name={organization.name} /><PortalLogout slug={slug} /></div><div className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold text-brand">Olá, {identity.name}</p><h1 className="text-3xl font-extrabold">Seus agendamentos</h1><div className="mt-2 flex flex-wrap gap-4 text-sm text-muted">{identity.email && <span className="flex items-center gap-1"><Mail className="size-4" />{identity.email}</span>}{identity.phone && <span className="flex items-center gap-1"><Phone className="size-4" />{identity.phone}</span>}</div></div><a className="primary-button" href={`/agendar/${slug}`}>Novo agendamento</a></div></section>
    <section className="panel"><h2 className="text-xl font-extrabold">Próximos agendamentos</h2>{!upcoming.length ? <p className="empty-state">Você não possui agendamentos futuros ativos.</p> : <div className="mt-4 grid gap-4">{upcoming.map((item) => <AppointmentCard key={item.id} item={item} organization={organization} />)}</div>}</section>
    <section className="panel"><h2 className="text-xl font-extrabold">Histórico</h2>{!history.length ? <p className="empty-state">Nenhum atendimento anterior.</p> : <div className="mt-4 grid gap-3">{history.map((item) => <div className="rounded-2xl border p-4" key={item.id}><div className="flex flex-wrap justify-between gap-2"><div><p className="font-extrabold">{item.service}</p><p className="mt-1 text-sm text-muted">{formatOrganizationDateTime(item.startsAt, organization.timezone)} · {item.professional || "Profissional a definir"}</p></div><span className="status-pill">{statusLabels[item.status]}</span></div></div>)}</div>}</section>
  </div></main>;
}

function Header({ name }: { name: string }) { return <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-accent text-brand-dark"><CalendarCheck className="size-5" /></span><div><p className="text-xs font-extrabold uppercase tracking-widest text-brand">Área do cliente</p><p className="text-xl font-extrabold">{name}</p></div></div>; }

function AppointmentCard({ item, organization }: { item: { id: string; startsAt: Date; status: keyof typeof statusLabels; token: string | null; service: string; professional: string | null }; organization: typeof organizations.$inferSelect }) {
  return <article className="rounded-2xl border p-4 sm:p-5"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-lg font-extrabold">{item.service}</p><p className="mt-1 text-sm text-muted">{formatOrganizationDateTime(item.startsAt, organization.timezone)} · {item.professional || "Profissional a definir"}</p></div><span className="status-pill">{statusLabels[item.status]}</span></div>{item.token && <AppointmentSelfService token={item.token} status={item.status} timezone={organization.timezone} bookingHorizonDays={organization.bookingHorizonDays} bookingUrl={`/agendar/${organization.slug}`} />}</article>;
}
