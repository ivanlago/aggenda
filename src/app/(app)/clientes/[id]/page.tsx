import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { appointments, clients, professionals, services } from "@/db/schema";
import { requireOrganization } from "@/lib/session";

const statusLabels = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  completed: "Concluído",
  no_show: "Não compareceu",
};

export default async function ClientHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organization } = await requireOrganization();
  const [client] = await db
    .select()
    .from(clients)
    .where(
      and(eq(clients.id, id), eq(clients.organizationId, organization.id))
    )
    .limit(1);
  if (!client) notFound();
  const history = await db
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      status: appointments.status,
      service: services.name,
      professional: professionals.name,
      notes: appointments.notes,
      cancellationReason: appointments.cancellationReason,
    })
    .from(appointments)
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .leftJoin(professionals, eq(professionals.id, appointments.professionalId))
    .where(
      and(
        eq(appointments.clientId, client.id),
        eq(appointments.organizationId, organization.id)
      )
    )
    .orderBy(desc(appointments.startsAt));
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow={`Histórico de ${organization.clientLabel.toLowerCase()}`}
        title={client.name}
        description={[client.phone, client.email].filter(Boolean).join(" · ") || "Sem contato informado"}
      />
      <section className="panel">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold">
            {history.length} {organization.appointmentLabelPlural.toLowerCase()}
          </h2>
          <Link href="/clientes" className="text-sm font-bold text-brand">Voltar</Link>
        </div>
        {client.notes && (
          <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">{client.notes}</p>
        )}
        <div className="mt-5 divide-y">
          {history.map((item) => (
            <article key={item.id} className="grid gap-2 py-4 sm:grid-cols-[150px_1fr_auto]">
              <p className="font-bold text-brand">
                {item.startsAt.toLocaleString("pt-BR")}
              </p>
              <div>
                <p className="font-bold">{item.service}</p>
                <p className="text-sm text-muted">
                  {item.professional || `Sem ${organization.professionalLabel.toLowerCase()}`}
                </p>
                {(item.notes || item.cancellationReason) && (
                  <p className="mt-1 text-xs text-muted">
                    {item.cancellationReason || item.notes}
                  </p>
                )}
              </div>
              <span className="status-pill">{statusLabels[item.status]}</span>
            </article>
          ))}
          {!history.length && <p className="empty-state">Nenhum histórico registrado.</p>}
        </div>
      </section>
    </div>
  );
}
