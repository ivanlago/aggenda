import { and, eq, gte } from "drizzle-orm";

import { createAppointment, updateAppointmentStatus } from "@/actions/app";
import { rescheduleAppointment } from "@/actions/schedule";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { appointments, clients, professionals, services } from "@/db/schema";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Agendamentos" };

const statuses = [
  ["scheduled", "Agendado"],
  ["confirmed", "Confirmado"],
  ["completed", "Concluído"],
  ["cancelled", "Cancelado"],
  ["no_show", "Não compareceu"],
] as const;

export default async function AppointmentsPage() {
  const { organization } = await requireOrganization();
  const [clientItems, professionalItems, serviceItems, items] = await Promise.all([
    db.select().from(clients).where(eq(clients.organizationId, organization.id)).orderBy(clients.name),
    db.select().from(professionals).where(
      and(
        eq(professionals.organizationId, organization.id),
        eq(professionals.isBookable, true),
        eq(professionals.isActive, true)
      )
    ).orderBy(professionals.name),
    db.select().from(services).where(eq(services.organizationId, organization.id)).orderBy(services.name),
    db.select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      status: appointments.status,
      client: clients.name,
      service: services.name,
      professional: professionals.name,
    }).from(appointments)
      .innerJoin(clients, eq(clients.id, appointments.clientId))
      .innerJoin(services, eq(services.id, appointments.serviceId))
      .leftJoin(professionals, eq(professionals.id, appointments.professionalId))
      .where(and(eq(appointments.organizationId, organization.id), gte(appointments.startsAt, new Date(new Date().setHours(0, 0, 0, 0)))))
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
        <form action={createAppointment} className="panel form-stack">
          <h2 className="text-lg font-extrabold">
            Novo {organization.appointmentLabel.toLowerCase()}
          </h2>
          <select className="field" name="clientId" required defaultValue="">
            <option value="" disabled>
              Selecione o {organization.clientLabel.toLowerCase()}
            </option>
            {clientItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select className="field" name="serviceId" required defaultValue="">
            <option value="" disabled>
              Selecione o {organization.serviceLabel.toLowerCase()}
            </option>
            {serviceItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select className="field" name="professionalId" defaultValue="">
            <option value="">
              Sem {organization.professionalLabel.toLowerCase()} específico
            </option>
            {professionalItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <input className="field" name="startsAt" type="datetime-local" required />
          <input className="field" name="price" inputMode="decimal" placeholder="Preço em reais (opcional)" />
          <textarea className="field min-h-20" name="notes" placeholder="Observações" />
          <button className="primary-button" disabled={!clientItems.length || !serviceItems.length}>
            Criar {organization.appointmentLabel.toLowerCase()}
          </button>
          {(!clientItems.length || !serviceItems.length) && (
            <p className="text-xs text-muted">
              Cadastre ao menos um {organization.clientLabel.toLowerCase()} e um{" "}
              {organization.serviceLabel.toLowerCase()}.
            </p>
          )}
        </form>
        <section className="panel">
          <h2 className="text-lg font-extrabold">{items.length} próximos</h2>
          <div className="mt-5 divide-y">
            {items.map((item) => (
              <article key={item.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-extrabold">{item.client}</p>
                    <p className="text-sm text-muted">{item.service}{item.professional ? ` · ${item.professional}` : ""}</p>
                    <p className="mt-1 text-sm font-bold text-brand">{item.startsAt.toLocaleString("pt-BR")}</p>
                  </div>
                  <form action={updateAppointmentStatus}>
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
                  </form>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-extrabold text-brand">
                    Reagendar
                  </summary>
                  <form action={rescheduleAppointment} className="mt-2 flex gap-2">
                    <input type="hidden" name="id" value={item.id} />
                    <input className="field py-2" name="startsAt" type="datetime-local" required />
                    <button className="primary-button py-2">Salvar</button>
                  </form>
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
