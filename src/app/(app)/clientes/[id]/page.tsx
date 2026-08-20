import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createClientClinicalMedia, createClientHistoryEntry } from "@/actions/app";
import { ActionForm } from "@/components/action-form";
import { ClinicalMediaGallery } from "@/components/clinical-media-gallery";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { appointments, clientClinicalMedia, clientHistoryEntries, clientPackageBalances, clientPackages, clients, professionals, servicePackages, services, users } from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { formatOrganizationDateTime } from "@/lib/appointment-safety";

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
  const [history, entries, packageRows, clinicalMedia] = await Promise.all([db
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
      electronicDocumentId: clientHistoryEntries.electronicDocumentId,
      occurredAt: clientHistoryEntries.occurredAt,
      createdAt: clientHistoryEntries.createdAt,
      author: users.name,
    }).from(clientHistoryEntries)
      .innerJoin(users, eq(users.id, clientHistoryEntries.authorUserId))
      .where(and(eq(clientHistoryEntries.clientId, client.id), eq(clientHistoryEntries.organizationId, organization.id)))
      .orderBy(desc(clientHistoryEntries.occurredAt)),
    db.select({
      id: clientPackages.id,
      packageName: servicePackages.name,
      serviceName: services.name,
      total: clientPackageBalances.totalQuantity,
      used: clientPackageBalances.usedQuantity,
      purchasedAt: clientPackages.purchasedAt,
      expiresAt: clientPackages.expiresAt,
      status: clientPackages.status,
    }).from(clientPackages)
      .innerJoin(servicePackages, eq(servicePackages.id, clientPackages.packageId))
      .innerJoin(clientPackageBalances, eq(clientPackageBalances.clientPackageId, clientPackages.id))
      .innerJoin(services, eq(services.id, clientPackageBalances.serviceId))
      .where(and(eq(clientPackages.clientId, client.id), eq(clientPackages.organizationId, organization.id)))
      .orderBy(desc(clientPackages.purchasedAt)),
    db.select().from(clientClinicalMedia).where(and(eq(clientClinicalMedia.clientId, client.id), eq(clientClinicalMedia.organizationId, organization.id))).orderBy(desc(clientClinicalMedia.capturedAt)),
  ]);
  const packages = new Map<string, { name: string; purchasedAt: Date; expiresAt: Date | null; status: string; balances: typeof packageRows }>();
  for (const row of packageRows) {
    const current = packages.get(row.id) ?? { name: row.packageName, purchasedAt: row.purchasedAt, expiresAt: row.expiresAt, status: row.status, balances: [] };
    current.balances.push(row);
    packages.set(row.id, current);
  }
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
      {isHealth && <section className="panel mb-5">
        <h2 className="text-lg font-extrabold">Fotografias clínicas</h2>
        <p className="mt-1 text-sm text-muted">Organize registros de antes, durante e depois. As imagens são compactadas, entregues por acesso autenticado e vinculadas ao consentimento.</p>
        <ActionForm action={createClientClinicalMedia} successMessage="Fotografia clínica enviada." className="mt-4 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="clientId" value={client.id} />
          <select className="field" name="phase"><option value="before">Antes</option><option value="during">Durante</option><option value="after">Depois</option><option value="clinical">Registro clínico</option></select>
          <input className="field" name="title" placeholder="Área ou procedimento" />
          <input className="field sm:col-span-2" name="file" type="file" accept="image/jpeg,image/png,image/webp" required />
          <label className="flex items-start gap-2 text-sm font-bold sm:col-span-2"><input className="mt-1" name="consentConfirmed" type="checkbox" required />Confirmo que há consentimento para este registro clínico.</label>
          <button className="primary-button sm:w-fit">Adicionar fotografia</button>
        </ActionForm>
        <ClinicalMediaGallery clientId={client.id} media={clinicalMedia.map((item) => ({ id: item.id, title: item.title, phase: item.phase, src: item.storageProvider === "cloudinary" ? `/api/clinical-media/${item.id}?width=1200` : item.url }))} />
      </section>}
      <section className="panel mb-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold">Pacotes e saldos</h2>
          <Link href="/pacotes" className="text-sm font-bold text-brand">Gerenciar pacotes</Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[...packages.entries()].map(([packageId, item]) => (
            <article key={packageId} className="rounded-2xl border p-4">
              <p className="font-extrabold">{item.name}</p>
              <p className="mt-1 text-xs text-muted">Adquirido em {item.purchasedAt.toLocaleDateString("pt-BR")}{item.expiresAt ? ` · válido até ${item.expiresAt.toLocaleDateString("pt-BR")}` : ""}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.balances.map((balance) => <span key={balance.serviceName} className="status-pill">{balance.serviceName}: {balance.total - balance.used} de {balance.total}</span>)}
              </div>
            </article>
          ))}
          {!packages.size && <p className="empty-state md:col-span-2">Este {organization.clientLabel.toLowerCase()} ainda não possui pacotes.</p>}
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
          {entries.map((entry) => entry.electronicDocumentId ? <article key={entry.id} className="grid gap-3 py-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-center">
            <p className="truncate font-extrabold">{entry.title || (entry.entryType === "prescription" ? "Receituário" : "Documento")}</p>
            <span className="text-xs font-bold text-muted md:whitespace-nowrap">{formatOrganizationDateTime(entry.occurredAt, organization.timezone)}</span>
            <Link className="secondary-button justify-center py-2 md:whitespace-nowrap" href={`/api/documents/${entry.electronicDocumentId}/pdf`}>Abrir PDF original</Link>
            {["prescription", "exam_request"].includes(entry.entryType) ? <Link className="secondary-button justify-center py-2 md:whitespace-nowrap" href={`/documentos?reuse=${entry.electronicDocumentId}`}>Criar nova a partir desta</Link> : <span />}
          </article> : <article key={entry.id} className="py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-extrabold">{entry.title || (entry.entryType === "evolution" ? "Evolução" : entry.entryType === "anamnesis" ? "Anamnese" : entry.entryType === "prescription" ? "Receita" : entry.entryType === "exam_request" ? "Solicitação de exames" : "Anotação")}</p>
              <span className="text-xs font-bold text-muted">{formatOrganizationDateTime(entry.occurredAt, organization.timezone)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{entry.content}</p>
            <p className="mt-2 text-xs text-muted">Registrado por {entry.author} em {formatOrganizationDateTime(entry.createdAt, organization.timezone)}</p>
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
                {formatOrganizationDateTime(item.startsAt, organization.timezone)}
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
