import { and, eq, gte } from "drizzle-orm";

import { createAppointment, updateAppointmentStatus } from "@/actions/app";
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
    db.select().from(professionals).where(eq(professionals.organizationId, organization.id)).orderBy(professionals.name),
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
      <PageHeader eyebrow="Operação" title="Agendamentos" description="Crie atendimentos e acompanhe cada etapa da agenda." />
      <div className="content-grid">
        <form action={createAppointment} className="panel form-stack">
          <h2 className="text-lg font-extrabold">Novo agendamento</h2>
          <select className="field" name="clientId" required defaultValue="">
            <option value="" disabled>Selecione o cliente</option>
            {clientItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select className="field" name="serviceId" required defaultValue="">
            <option value="" disabled>Selecione o serviço</option>
            {serviceItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select className="field" name="professionalId" defaultValue="">
            <option value="">Sem profissional específico</option>
            {professionalItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <input className="field" name="startsAt" type="datetime-local" required />
          <input className="field" name="priceInCents" type="number" min="0" placeholder="Preço em centavos (opcional)" />
          <textarea className="field min-h-20" name="notes" placeholder="Observações" />
          <button className="primary-button" disabled={!clientItems.length || !serviceItems.length}>Agendar</button>
          {(!clientItems.length || !serviceItems.length) && <p className="text-xs text-muted">Cadastre ao menos um cliente e um serviço.</p>}
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
                    <button className="mt-2 w-full text-xs font-extrabold text-brand">Atualizar</button>
                  </form>
                </div>
              </article>
            ))}
            {!items.length && <p className="empty-state">Nenhum agendamento futuro.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
