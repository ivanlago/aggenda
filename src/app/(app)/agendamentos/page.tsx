import { and, eq, gte } from "drizzle-orm";

import { createAppointment, updateAppointmentStatus } from "@/actions/app";
import { rescheduleAppointment } from "@/actions/schedule";
import { ActionForm } from "@/components/action-form";
import { AppointmentCreateForm } from "@/components/appointment-create-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { appointments, clientPackageBalances, clientPackages, clients, packageUsages, professionals, servicePackages, services, servicesToProfessionals } from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { formatOrganizationDateTime, organizationDayRange } from "@/lib/appointment-safety";

export const metadata = { title: "Agendamentos" };

const statuses = [
  ["scheduled", "Agendado"],
  ["confirmed", "Confirmado"],
  ["completed", "Concluído"],
  ["cancelled", "Cancelado"],
  ["no_show", "Não compareceu"],
] as const;

function whatsappLink(phone: string, message: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  const international = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}

export default async function AppointmentsPage() {
  const { organization } = await requireOrganization();
  const today = organizationDayRange(new Date(), organization.timezone);
  const [clientItems, professionalItems, serviceItems, serviceProfessionalLinks, packageBalanceRows, items] = await Promise.all([
    db.select().from(clients).where(eq(clients.organizationId, organization.id)).orderBy(clients.name),
    db.select().from(professionals).where(
      and(
        eq(professionals.organizationId, organization.id),
        eq(professionals.isBookable, true),
        eq(professionals.isActive, true)
      )
    ).orderBy(professionals.name),
    db.select().from(services).where(and(eq(services.organizationId, organization.id), eq(services.isActive, true))).orderBy(services.name),
    db.select({ serviceId: servicesToProfessionals.serviceId, professionalId: servicesToProfessionals.professionalId })
      .from(servicesToProfessionals)
      .where(eq(servicesToProfessionals.organizationId, organization.id)),
    db.select({
      clientPackageId: clientPackages.id,
      clientId: clientPackages.clientId,
      serviceId: clientPackageBalances.serviceId,
      packageName: servicePackages.name,
      total: clientPackageBalances.totalQuantity,
      used: clientPackageBalances.usedQuantity,
      expiresAt: clientPackages.expiresAt,
    }).from(clientPackageBalances)
      .innerJoin(clientPackages, eq(clientPackages.id, clientPackageBalances.clientPackageId))
      .innerJoin(servicePackages, eq(servicePackages.id, clientPackages.packageId))
      .where(and(
        eq(clientPackageBalances.organizationId, organization.id),
        eq(clientPackages.status, "active")
      )),
    db.select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      status: appointments.status,
      client: clients.name,
      clientPhone: clients.phone,
      service: services.name,
      professional: professionals.name,
      packageName: servicePackages.name,
      packageUsageStatus: packageUsages.status,
    }).from(appointments)
      .innerJoin(clients, eq(clients.id, appointments.clientId))
      .innerJoin(services, eq(services.id, appointments.serviceId))
      .leftJoin(professionals, eq(professionals.id, appointments.professionalId))
      .leftJoin(packageUsages, eq(packageUsages.appointmentId, appointments.id))
      .leftJoin(clientPackages, eq(clientPackages.id, packageUsages.clientPackageId))
      .leftJoin(servicePackages, eq(servicePackages.id, clientPackages.packageId))
      .where(and(eq(appointments.organizationId, organization.id), gte(appointments.startsAt, today.start)))
      .orderBy(appointments.startsAt),
  ]);

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Operação"
        title={organization.appointmentLabelPlural}
        description={`Crie ${organization.appointmentLabelPlural.toLowerCase()} e acompanhe cada etapa da operação.`}
      />
      <div className="content-grid">
        <AppointmentCreateForm
          action={createAppointment}
          clients={clientItems}
          services={serviceItems}
          professionals={professionalItems}
          serviceProfessionalLinks={serviceProfessionalLinks}
          packageBalances={packageBalanceRows
            .filter((item) => item.used < item.total && (!item.expiresAt || item.expiresAt > new Date()))
            .map((item) => ({ ...item, remaining: item.total - item.used, expiresAt: item.expiresAt?.toISOString() ?? null }))}
          labels={{ client: organization.clientLabel, service: organization.serviceLabel, professional: organization.professionalLabel, appointment: organization.appointmentLabel }}
          timezone={organization.timezone}
        />
        <section className="panel">
          <h2 className="text-lg font-extrabold">{items.length} próximos</h2>
          <div className="mt-5 divide-y">
            {items.map((item) => (
              <article key={item.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold">{item.client}</p>
                    <p className="text-sm text-muted">{item.service}{item.professional ? ` · ${item.professional}` : ""}</p>
                    {item.packageName && <p className="mt-1 text-xs font-bold text-brand">Pacote: {item.packageName} · {item.packageUsageStatus === "consumed" ? "sessão utilizada" : item.packageUsageStatus === "reversed" ? "sessão devolvida" : "sessão reservada"}</p>}
                    <p className="mt-1 text-sm font-bold text-brand">{formatOrganizationDateTime(item.startsAt, organization.timezone)}</p>
                  </div>
                  <ActionForm action={updateAppointmentStatus} successMessage="Status atualizado com sucesso.">
                    <input type="hidden" name="id" value={item.id} />
                    <select className="field py-2" name="status" defaultValue={item.status}>
                      {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <input
                      className="field mt-2 py-2"
                      name="cancellationReason"
                      placeholder="Motivo se cancelar"
                    />
                    <button className="mt-2 w-full text-xs font-extrabold text-brand">Atualizar</button>
                  </ActionForm>
                </div>
                {item.clientPhone && (() => {
                  const formattedDate = formatOrganizationDateTime(item.startsAt, organization.timezone);
                  const href = whatsappLink(
                    item.clientPhone,
                    `Olá, ${item.client}! Seu ${organization.appointmentLabel.toLowerCase()} de ${item.service} está marcado para ${formattedDate}.${item.professional ? ` Profissional: ${item.professional}.` : ""}`,
                  );
                  return href ? <a className="mt-3 inline-flex rounded-xl border px-3 py-2 text-xs font-extrabold text-brand transition hover:bg-[#edf7f1]" href={href} target="_blank" rel="noreferrer">Enviar pelo WhatsApp</a> : null;
                })()}
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-extrabold text-brand">
                    Reagendar
                  </summary>
                  <ActionForm action={rescheduleAppointment} successMessage="Agendamento remarcado com sucesso." className="mt-2 flex gap-2">
                    <input type="hidden" name="id" value={item.id} />
                    <input className="field py-2" name="startsAt" type="datetime-local" required />
                    <button className="primary-button py-2">Salvar</button>
                  </ActionForm>
                </details>
              </article>
            ))}
            {!items.length && (
              <p className="empty-state">
                Nenhum {organization.appointmentLabel.toLowerCase()} futuro.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
