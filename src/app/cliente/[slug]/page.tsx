import { randomBytes } from "node:crypto";

import { and, desc, eq, gt } from "drizzle-orm";
import { CalendarCheck, ExternalLink, Globe2, Mail, MapPin, Phone, Sparkles } from "lucide-react";
import Image from "next/image";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { AppointmentSelfService } from "@/app/agendamento/[token]/self-service";
import { db } from "@/db";
import { appointments, clientPortalSessions, clients, organizations, professionals, services, servicesToProfessionals } from "@/db/schema";
import { formatOrganizationDateTime } from "@/lib/appointment-safety";
import { CLIENT_CHALLENGE_COOKIE, CLIENT_PORTAL_COOKIE, portalHash } from "@/lib/client-portal";
import { formatPhone } from "@/lib/phone";

import { PortalLogin, PortalLogout } from "./portal-login";
import { PortalBooking } from "./portal-booking";

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

  if (!identity) return <main className="min-h-screen p-4 sm:p-8" style={{ background: `linear-gradient(145deg, ${organization.brandColor}18, #f3f5f1 55%)` }}><div className="mx-auto grid max-w-5xl gap-6"><CompanyHero organization={organization} /><section className="panel mx-auto w-full max-w-xl shadow-xl shadow-brand/5"><div className="text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-brand-dark"><CalendarCheck className="size-6" /></span><p className="mt-4 text-xs font-extrabold uppercase tracking-widest text-brand">Acesso seguro</p><h1 className="mt-1 text-3xl font-extrabold">Sua área do cliente</h1><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">Agende uma consulta ou um serviço</p></div><PortalLogin slug={slug} hasChallenge={Boolean(cookieStore.get(CLIENT_CHALLENGE_COOKIE))} initialError={query.erro === "link-expirado" ? "Este link expirou. Solicite um novo acesso." : query.erro === "cadastro-existente" ? "Já existe um cadastro com estes dados. Entre em contato com a empresa para confirmar seu acesso." : undefined} /><p className="mt-5 text-center text-xs leading-5 text-muted">Se seus dados estiverem desatualizados, entre em contato com a empresa para proteger seu cadastro.</p></section><CompanyFooter organization={organization} /></div></main>;

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
  const [serviceCatalog, professionalCatalog, qualificationLinks] = await Promise.all([
    db.select({ id: services.id, name: services.name, durationMinutes: services.durationMinutes, priceInCents: services.priceInCents }).from(services).where(and(eq(services.organizationId, organization.id), eq(services.isActive, true))).orderBy(services.name),
    db.select({ id: professionals.id, name: professionals.name }).from(professionals).where(and(eq(professionals.organizationId, organization.id), eq(professionals.isActive, true), eq(professionals.isBookable, true))).orderBy(professionals.name),
    db.select({ serviceId: servicesToProfessionals.serviceId, professionalId: servicesToProfessionals.professionalId }).from(servicesToProfessionals).where(eq(servicesToProfessionals.organizationId, organization.id)),
  ]);
  const bookableServices = serviceCatalog.map((service) => ({ ...service, professionalIds: qualificationLinks.filter((link) => link.serviceId === service.id).map((link) => link.professionalId) }));
  return <main className="min-h-screen p-4 sm:p-8" style={{ background: `linear-gradient(145deg, ${organization.brandColor}18, #f3f5f1 55%)` }}><div className="mx-auto grid max-w-5xl gap-6">
    <CompanyHero organization={organization} />
    <section className="panel"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold text-brand">Olá, {identity.name}</p><h1 className="text-3xl font-extrabold">Seus agendamentos</h1><div className="mt-2 flex flex-wrap gap-4 text-sm text-muted">{identity.email && <span className="flex items-center gap-1"><Mail className="size-4" />{identity.email}</span>}{identity.phone && <span className="flex items-center gap-1"><Phone className="size-4" />{formatPhone(identity.phone)}</span>}</div></div><PortalLogout slug={slug} /></div><div className="mt-5 border-t pt-5"><a className="primary-button inline-flex" href="#novo-agendamento">Marcar novo horário</a></div></section>
    <section className="panel"><h2 className="text-xl font-extrabold">Próximos agendamentos</h2>{!upcoming.length ? <p className="empty-state">Você não possui agendamentos futuros ativos.</p> : <div className="mt-4 grid gap-4">{upcoming.map((item) => <AppointmentCard key={item.id} item={item} organization={organization} />)}</div>}</section>
    <section id="novo-agendamento" className="panel"><h2 className="text-2xl font-extrabold">Novo agendamento</h2><PortalBooking slug={slug} services={bookableServices} professionals={professionalCatalog} timezone={organization.timezone} horizonDays={organization.bookingHorizonDays} hasUpcoming={upcoming.length > 0} /></section>
    <section className="panel"><h2 className="text-xl font-extrabold">Histórico</h2>{!history.length ? <p className="empty-state">Nenhum atendimento anterior.</p> : <div className="mt-4 grid gap-3">{history.map((item) => <div className="rounded-2xl border p-4" key={item.id}><div className="flex flex-wrap justify-between gap-2"><div><p className="font-extrabold">{item.service}</p><p className="mt-1 text-sm text-muted">{formatOrganizationDateTime(item.startsAt, organization.timezone)} · {item.professional || "Profissional a definir"}</p></div><span className="status-pill">{statusLabels[item.status]}</span></div></div>)}</div>}</section>
    <CompanyFooter organization={organization} />
  </div></main>;
}

function CompanyHero({ organization }: { organization: typeof organizations.$inferSelect }) {
  return <header className="relative overflow-hidden rounded-[2rem] border bg-white shadow-xl shadow-brand/5">{organization.publicCoverUrl && <Image className="absolute inset-0 h-full w-full object-cover opacity-20" src={organization.publicCoverUrl} alt="" fill unoptimized />}<div className="absolute inset-0" style={{ background: `linear-gradient(105deg, white 25%, ${organization.brandColor}18)` }} /><div className="relative flex min-h-56 flex-col justify-end gap-5 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-10"><div className="flex items-center gap-4">{organization.publicLogoUrl ? <span className="grid size-20 shrink-0 place-items-center rounded-2xl border bg-white p-2 shadow-sm"><Image className="max-h-full max-w-full object-contain" src={organization.publicLogoUrl} alt={`Logo de ${organization.name}`} width={80} height={80} unoptimized /></span> : <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-accent text-brand-dark"><CalendarCheck className="size-7" /></span>}<div><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-brand">Portal do cliente</p><h1 className="mt-1 text-3xl font-black sm:text-4xl">{organization.name}</h1>{organization.publicDescription && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{organization.publicDescription}</p>}</div></div>{organization.publicWhatsapp && <a className="secondary-button bg-white" href={`https://wa.me/${organization.publicWhatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><Phone className="mr-2 size-4" />Falar com a empresa</a>}</div></header>;
}

function CompanyFooter({ organization }: { organization: typeof organizations.$inferSelect }) {
  const website = organization.publicWebsite ? (/^https?:\/\//i.test(organization.publicWebsite) ? organization.publicWebsite : `https://${organization.publicWebsite}`) : null;
  const mapUrl = organization.publicAddress ? `https://www.google.com/maps?q=${encodeURIComponent(organization.publicAddress)}&output=embed` : null;
  const directionsUrl = organization.publicAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(organization.publicAddress)}` : null;
  const phones = ([...new Set([organization.phone, organization.publicWhatsapp].filter(Boolean))] as string[]).map((phone) => formatPhone(phone));
  return <footer className="overflow-hidden rounded-[2rem] border bg-white shadow-sm"><div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1fr_1.35fr]"><div><p className="text-xs font-extrabold uppercase tracking-widest text-brand">Informações da empresa</p><h2 className="mt-2 text-2xl font-extrabold">{organization.name}</h2>{organization.legalName && organization.legalName !== organization.name && <p className="mt-1 text-sm text-muted">{organization.legalName}</p>}<div className="mt-6 grid gap-4 text-sm">{organization.publicAddress && <div className="flex items-start gap-3"><MapPin className="mt-0.5 size-5 shrink-0 text-brand" /><span>{organization.publicAddress}</span></div>}{phones.map((phone) => <a className="flex items-center gap-3 font-bold" key={phone} href={`tel:${phone.replace(/\D/g, "")}`}><Phone className="size-5 text-brand" />{phone}</a>)}{organization.publicEmail && <a className="flex items-center gap-3 font-bold" href={`mailto:${organization.publicEmail}`}><Mail className="size-5 text-brand" />{organization.publicEmail}</a>}{website && <a className="flex items-center gap-3 font-bold" href={website} target="_blank" rel="noreferrer"><Globe2 className="size-5 text-brand" />Visitar site <ExternalLink className="size-3" /></a>}</div></div>{mapUrl ? <div className="overflow-hidden rounded-2xl border bg-slate-50"><iframe className="h-72 w-full" src={mapUrl} title={`Mapa de ${organization.name}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />{directionsUrl && <a className="flex items-center justify-center gap-2 border-t p-3 text-sm font-extrabold text-brand" href={directionsUrl} target="_blank" rel="noreferrer"><MapPin className="size-4" />Abrir rota no Google Maps <ExternalLink className="size-3" /></a>}</div> : <div className="grid min-h-52 place-items-center rounded-2xl border bg-slate-50 p-6 text-center text-sm text-muted"><MapPin className="mb-2 size-7" />Endereço ainda não informado pela empresa.</div>}</div><div className="flex flex-wrap items-center justify-center gap-2 border-t bg-[#f8faf7] px-6 py-5 text-xs font-bold text-muted"><Sparkles className="size-4 text-brand" /><span>Tecnologia <strong className="text-brand">Aggenda</strong> para uma experiência segura de agendamento.</span></div></footer>;
}

function AppointmentCard({ item, organization }: { item: { id: string; startsAt: Date; status: keyof typeof statusLabels; token: string | null; service: string; professional: string | null }; organization: typeof organizations.$inferSelect }) {
  return <article className="rounded-2xl border p-4 sm:p-5"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-lg font-extrabold">{item.service}</p><p className="mt-1 text-sm text-muted">{formatOrganizationDateTime(item.startsAt, organization.timezone)} · {item.professional || "Profissional a definir"}</p></div><span className="status-pill">{statusLabels[item.status]}</span></div>{item.token && <AppointmentSelfService token={item.token} status={item.status} timezone={organization.timezone} bookingHorizonDays={organization.bookingHorizonDays} bookingUrl={`/agendar/${organization.slug}`} />}</article>;
}
