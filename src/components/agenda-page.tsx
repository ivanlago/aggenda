import { and, eq, gte, inArray } from "drizzle-orm";

import { createAppointment, updateAppointmentStatus } from "@/actions/app";
import { rescheduleAppointment } from "@/actions/schedule";
import { db } from "@/db";
import { appointments, clientPackageBalances, clientPackages, clients, packageUsages, professionals, servicePackages, services, servicesToProfessionals } from "@/db/schema";
import { formatOrganizationDateTime, organizationDayRange } from "@/lib/appointment-safety";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization, requireProfessionalScope } from "@/lib/session";

import { AppointmentCreateForm } from "./appointment-create-form";
import { AppointmentRescheduleForm } from "./appointment-reschedule-form";
import { AppointmentStatusForm } from "./appointment-status-form";
import { ModalShell } from "./modal-shell";
import { PageHeader } from "./page-header";
import { AppointmentPaymentForm } from "@/app/dashboard/appointment-payment-form";

const statuses = [["scheduled", "Agendado"], ["confirmed", "Confirmado"], ["completed", "Concluído"], ["cancelled", "Cancelado"], ["no_show", "Não compareceu"]] as const;
const statusLabels = Object.fromEntries(statuses);

function whatsappLink(phone: string, message: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}?text=${encodeURIComponent(message)}`;
}

export async function AgendaPage({ openNewAppointment = false }: { openNewAppointment?: boolean }) {
  const { session, organization } = await requireOrganization();
  const professionalScopeId = organization.role === "professional" ? await requireProfessionalScope(organization.id, session.user.id) : null;
  const canManage = hasOrganizationPermission(organization.role, "appointments.manage");
  const canManageFinance = hasOrganizationPermission(organization.role, "finance.manage");
  const canSendWhatsApp = !["viewer", "member"].includes(organization.role);
  const today = organizationDayRange(new Date(), organization.timezone);
  const [clientItems, professionalItems, serviceItems, links, packageRows, items] = await Promise.all([
    db.select().from(clients).where(and(eq(clients.organizationId, organization.id), professionalScopeId ? inArray(clients.id, db.select({ id: appointments.clientId }).from(appointments).where(and(eq(appointments.organizationId, organization.id), eq(appointments.professionalId, professionalScopeId)))) : undefined)).orderBy(clients.name),
    db.select().from(professionals).where(and(eq(professionals.organizationId, organization.id), eq(professionals.isBookable, true), eq(professionals.isActive, true), professionalScopeId ? eq(professionals.id, professionalScopeId) : undefined)).orderBy(professionals.name),
    db.select().from(services).where(and(eq(services.organizationId, organization.id), eq(services.isActive, true))).orderBy(services.name),
    db.select({ serviceId: servicesToProfessionals.serviceId, professionalId: servicesToProfessionals.professionalId }).from(servicesToProfessionals).where(and(eq(servicesToProfessionals.organizationId, organization.id), professionalScopeId ? eq(servicesToProfessionals.professionalId, professionalScopeId) : undefined)),
    db.select({ clientPackageId: clientPackages.id, clientId: clientPackages.clientId, serviceId: clientPackageBalances.serviceId, packageName: servicePackages.name, total: clientPackageBalances.totalQuantity, used: clientPackageBalances.usedQuantity, expiresAt: clientPackages.expiresAt }).from(clientPackageBalances).innerJoin(clientPackages, eq(clientPackages.id, clientPackageBalances.clientPackageId)).innerJoin(servicePackages, eq(servicePackages.id, clientPackages.packageId)).where(and(eq(clientPackageBalances.organizationId, organization.id), eq(clientPackages.status, "active"))),
    db.select({ id: appointments.id, startsAt: appointments.startsAt, status: appointments.status, cancellationReason: appointments.cancellationReason, clientId: appointments.clientId, client: clients.name, clientPhone: clients.phone, service: services.name, serviceId: appointments.serviceId, servicePrice: services.priceInCents, appointmentPrice: appointments.priceInCents, professional: professionals.name, professionalId: appointments.professionalId, clientPackageId: packageUsages.clientPackageId, packageName: servicePackages.name, packageStatus: packageUsages.status }).from(appointments).innerJoin(clients, eq(clients.id, appointments.clientId)).innerJoin(services, eq(services.id, appointments.serviceId)).leftJoin(professionals, eq(professionals.id, appointments.professionalId)).leftJoin(packageUsages, eq(packageUsages.appointmentId, appointments.id)).leftJoin(clientPackages, eq(clientPackages.id, packageUsages.clientPackageId)).leftJoin(servicePackages, eq(servicePackages.id, clientPackages.packageId)).where(and(eq(appointments.organizationId, organization.id), gte(appointments.startsAt, today.start), professionalScopeId ? eq(appointments.professionalId, professionalScopeId) : undefined)).orderBy(appointments.startsAt),
  ]);
  const createForm = <AppointmentCreateForm action={createAppointment} clients={clientItems} services={serviceItems} professionals={professionalItems} serviceProfessionalLinks={links} packageBalances={packageRows.filter((item) => item.used < item.total && (!item.expiresAt || item.expiresAt > new Date())).map((item) => ({ ...item, remaining: item.total - item.used, expiresAt: item.expiresAt?.toISOString() ?? null }))} labels={{ client: organization.clientLabel, service: organization.serviceLabel, professional: organization.professionalLabel, appointment: organization.appointmentLabel }} timezone={organization.timezone} />;

  return <div className="page-wrap">
    <PageHeader eyebrow="Operação" title="Agenda" description="Acompanhe e gerencie os próximos atendimentos." />
    {canManage && <div className="mb-5 sm:w-fit"><ModalShell title="Novo Agendamento" variant="new" defaultOpen={openNewAppointment}>{createForm}</ModalShell></div>}
    <section className="panel">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-extrabold">Próximos atendimentos</h2><span className="text-sm text-muted">{items.length} registros</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm">
        <thead className="border-b text-xs uppercase text-muted"><tr><th className="p-3">Hora</th><th className="p-3">Atendimento</th><th className="p-3">Status</th><th className="p-3">Profissional</th><th className="p-3">Cliente</th>{canManageFinance && <th className="p-3"><span className="sr-only">Pagamento</span></th>}{canManage && <th className="p-3"><span className="sr-only">Editar</span></th>}</tr></thead>
        <tbody className="divide-y">{items.map((item) => {
          const dateTime = formatOrganizationDateTime(item.startsAt, organization.timezone);
          const [date, time] = dateTime.split(", ");
          const message = `Olá, ${item.client}! Seu ${organization.appointmentLabel.toLowerCase()} de ${item.service} está marcado para ${dateTime}.${item.professional ? ` Profissional: ${item.professional}.` : ""}`;
          const whatsapp = item.clientPhone ? whatsappLink(item.clientPhone, message) : null;
          const price = ((item.appointmentPrice ?? item.servicePrice ?? 0) / 100).toFixed(2).replace(".", ",");
          const availablePackages = packageRows.filter((bundle) => bundle.clientId === item.clientId && bundle.serviceId === item.serviceId && ((!bundle.expiresAt || bundle.expiresAt > new Date()) && (bundle.used < bundle.total || bundle.clientPackageId === item.clientPackageId))).map((bundle) => ({ id: bundle.clientPackageId, name: bundle.packageName, remaining: bundle.total - bundle.used, current: bundle.clientPackageId === item.clientPackageId }));
          return <tr key={item.id}>
            <td className="whitespace-nowrap p-3"><strong>{time ?? dateTime}</strong><p className="text-xs text-muted">{time ? date : ""}</p></td>
            <td className="p-3 font-bold">Atendimento</td>
            <td className="p-3"><span className="status-pill">{statusLabels[item.status] ?? item.status}</span></td>
            <td className="p-3">{item.professional ?? "—"}</td><td className="p-3 font-bold">{item.client}</td>
            {canManageFinance && <td className="p-3"><ModalShell title="Registrar pagamento" variant="payment"><AppointmentPaymentForm appointmentId={item.id} client={item.client} description={item.service} defaultAmount={price} packages={availablePackages} /></ModalShell></td>}
            {canManage && <td className="p-3"><ModalShell title="Editar agendamento" variant="edit"><div className="grid gap-5"><div className="rounded-2xl bg-slate-50 p-4"><p className="font-extrabold">{item.client}</p><p className="text-sm text-muted">{item.service} · {item.professional ?? "Sem profissional"}</p><p className="mt-1 text-sm font-bold text-brand">{dateTime}</p>{item.packageName && <p className="mt-1 text-xs text-brand">Pacote: {item.packageName} · {item.packageStatus}</p>}</div><AppointmentStatusForm action={updateAppointmentStatus} appointmentId={item.id} initialStatus={item.status} initialCancellationReason={item.cancellationReason} statuses={statuses} />{item.professionalId && <div><h3 className="font-extrabold">Reagendar</h3><AppointmentRescheduleForm action={rescheduleAppointment} appointmentId={item.id} serviceId={item.serviceId} professionalId={item.professionalId} timezone={organization.timezone} /></div>}{canSendWhatsApp && whatsapp && <a className="secondary-button sm:w-fit" href={whatsapp} target="_blank" rel="noreferrer">Enviar pelo WhatsApp</a>}</div></ModalShell></td>}
          </tr>;
        })}</tbody>
      </table>{!items.length && <p className="empty-state">Nenhum atendimento futuro.</p>}</div>
    </section>
  </div>;
}
