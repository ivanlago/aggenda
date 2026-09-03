import { and, eq } from "drizzle-orm";
import { CalendarCheck } from "lucide-react";
import { notFound } from "next/navigation";

import { AppointmentSelfService } from "./self-service";
import { db } from "@/db";
import { appointments, clients, organizations, professionals, services } from "@/db/schema";
import { formatOrganizationDateTime } from "@/lib/appointment-safety";

export default async function AppointmentManagementPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [item] = await db.select({ id: appointments.id, status: appointments.status, startsAt: appointments.startsAt, client: clients.name, organization: organizations.name, organizationSlug: organizations.slug, timezone: organizations.timezone, bookingHorizonDays: organizations.bookingHorizonDays, service: services.name, professional: professionals.name }).from(appointments).innerJoin(clients, eq(clients.id, appointments.clientId)).innerJoin(organizations, eq(organizations.id, appointments.organizationId)).innerJoin(services, eq(services.id, appointments.serviceId)).leftJoin(professionals, eq(professionals.id, appointments.professionalId)).where(and(eq(appointments.publicManageToken, token))).limit(1);
  if (!item) notFound();
  return <main className="grid min-h-screen place-items-center bg-[#f3f5f1] p-5"><section className="panel w-full max-w-xl"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-accent text-brand-dark"><CalendarCheck className="size-5" /></span><div><p className="text-xs font-extrabold uppercase tracking-widest text-brand">Gerenciar agendamento</p><h1 className="text-2xl font-extrabold">{item.organization}</h1></div></div><div className="mt-6 rounded-2xl border p-4"><p className="font-extrabold">{item.service}</p><p className="mt-1 text-sm text-muted">{formatOrganizationDateTime(item.startsAt, item.timezone)} · {item.professional || "Profissional a definir"}</p><p className="mt-2 text-sm">Paciente: {item.client}</p><span className="status-pill mt-3">{{ scheduled: "Aguardando confirmação", confirmed: "Confirmado", cancelled: "Cancelado", completed: "Concluído", no_show: "Não compareceu" }[item.status]}</span></div><AppointmentSelfService token={token} status={item.status} timezone={item.timezone} bookingHorizonDays={item.bookingHorizonDays} bookingUrl={`/agendar/${item.organizationSlug}`} /></section></main>;
}
