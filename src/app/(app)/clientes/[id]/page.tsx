import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createClientHistoryEntry } from "@/actions/app";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { appointments, clientHistoryEntries, clients, professionals, services, users } from "@/db/schema";
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
  const [history, entries] = await Promise.all([db
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
    .orderBy(desc(appointments.startsAt)),
    db.select({
      id: clientHistoryEntries.id,
      entryType: clientHistoryEntries.entryType,
      title: clientHistoryEntries.title,
      content: clientHistoryEntries.content,
      occurredAt: clientHistoryEntries.occurredAt,
      createdAt: clientHistoryEntries.createdAt,
      author: users.name,
    }).from(clientHistoryEntries)
      .innerJoin(users, eq(users.id, clientHistoryEntries.authorUserId))
      .where(and(eq(clientHistoryEntries.clientId, client.id), eq(clientHistoryEntries.organizationId, organization.id)))
      .orderBy(desc(clientHistoryEntries.occurredAt)),
  ]);
  const isHealth = organization.businessType === "saude";
  const recordLabel = isHealth ? "Prontuário" : "Histórico do cliente";
  const genderLabels: Record<string, string> = { female: "Feminino", male: "Masculino", other: "Outro", not_informed: "Prefere não informar" };
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow={`Histórico de ${organization.clientLabel.toLowerCase()}`}
        title={client.name}
        description={[client.phone, client.email].filter(Boolean).join(" · ") || "Sem contato informado"}
      />
      <section className="panel mb-5">
        <h2 className="text-lg font-extrabold">Dados cadastrais</h2>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div><p className="text-muted">Data de nascimento</p><p className="font-bold">{client.birthDate ? new Date(`${client.birthDate}T12:00:00Z`).toLocaleDateString("pt-BR") : "Não informada"}</p></div>
          <div><p className="text-muted">Sexo</p><p className="font-bold">{client.gender ? genderLabels[client.gender] ?? client.gender : "Não informado"}</p></div>
          <div><p className="text-muted">Contato</p><p className="font-bold">{client.phone || client.email || "Não informado"}</p></div>
        </div>
      </section>
      <section className="panel mb-5">
        <h2 className="text-lg font-extrabold">{recordLabel}</h2>
        <p className="mt-1 text-sm text-muted">Registre evoluções e informações relevantes com autoria e data.</p>
        <ActionForm action={createClientHistoryEntry} successMessage={`${recordLabel} atualizado com sucesso.`} className="mt-5 grid gap-3">
          <input type="hidden" name="clientId" value={client.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <select className="field" name="entryType" defaultValue={isHealth ? "evolution" : "note"}>
              <option value="note">Anotação</option>
              {isHealth && <option value="evolution">Evolução</option>}
              {isHealth && <option value="anamnesis">Anamnese</option>}
              <option value="document">Documento/registro</option>
            </select>
            <input className="field" name="occurredAt" type="datetime-local" aria-label="Data e hora do registro" />
          </div>
          <input className="field" name="title" placeholder="Título (opcional)" />
          <textarea className="field min-h-28" name="content" required placeholder={isHealth ? "Evolução, observações clínicas e conduta" : "Informações relevantes do atendimento"} />
          <button className="primary-button sm:w-fit">Adicionar ao {recordLabel.toLowerCase()}</button>
        </ActionForm>
        <div className="mt-6 divide-y">
          {entries.map((entry) => <article key={entry.id} className="py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-extrabold">{entry.title || (entry.entryType === "evolution" ? "Evolução" : entry.entryType === "anamnesis" ? "Anamnese" : "Anotação")}</p>
              <span className="text-xs font-bold text-muted">{entry.occurredAt.toLocaleString("pt-BR")}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{entry.content}</p>
            <p className="mt-2 text-xs text-muted">Registrado por {entry.author} em {entry.createdAt.toLocaleString("pt-BR")}</p>
          </article>)}
          {!entries.length && <p className="empty-state">Nenhum registro adicionado.</p>}
        </div>
      </section>
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
