import { ClientDocumentList } from "@/components/client-document-list";
import { ModalShell } from "@/components/modal-shell";
import { FormActions } from "@/components/form-dialog-context";
import { PaginatedCollection } from "@/components/paginated-collection";
import { PortalDependents } from "@/components/portal-dependents";
import { and, desc, eq, inArray } from "drizzle-orm";
import { consumedPackageQuantity } from "@/lib/package-remaining";
import Link from "next/link";
import Image from "next/image";
import { ClientOptionalFields } from "@/components/client-optional-fields";
import { EntityImageField } from "@/components/entity-image-field";
import { PhoneInput } from "@/components/phone-input";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ClinicalPhotoTreatmentField } from "@/components/clinical-photo-treatment-field";
import { createClientClinicalMedia, createClientHistoryEntry, updateClient } from "@/actions/app";
import { ActionForm } from "@/components/action-form";
import { ClinicalMediaGallery } from "@/components/clinical-media-gallery";
import { ClinicalPhotoClassificationFields } from "@/components/clinical-photo-classification-fields";
import { GuidedClinicalPhotoInput } from "@/components/guided-clinical-photo-input";
import { PageHeader } from "@/components/page-header";
import { ClinicalWorkspace } from "@/components/clinical-workspace";
import { db } from "@/db";
import { appointments, auditLogs, clientClinicalMedia, clientHistoryEntries, clientPackageBalances, clientPackages, clients, electronicDocuments, professionals, servicePackages, services, users } from "@/db/schema";
import { requireOrganization, requireProfessionalScope } from "@/lib/session";
import { formatOrganizationDateTime } from "@/lib/appointment-safety";
import { hasOrganizationPermission } from "@/lib/permissions";
import { formatPhone } from "@/lib/phone";

const statusLabels = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  completed: "Concluído",
  no_show: "Não compareceu",
};

function CollapsiblePanel({ title, children, className = "mb-5", id, open }: { title: ReactNode; children: ReactNode; className?: string; id?: string; open?: boolean }) {
  return (
    <details id={id} open={open} className={`panel group ${className}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-lg font-extrabold marker:hidden">
        <span>{title}</span>
        <span className="text-sm font-bold text-brand group-open:hidden">Exibir</span>
        <span className="hidden text-sm font-bold text-brand group-open:inline">Minimizar</span>
      </summary>
      <div className="mt-4 border-t pt-4">{children}</div>
    </details>
  );
}

export default async function ClientHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const { id } = await params;
  const { section } = await searchParams;
  const { session, organization } = await requireOrganization();
  const professionalScopeId = organization.role === "professional"
    ? await requireProfessionalScope(organization.id, session.user.id)
    : null;
  const canManage = hasOrganizationPermission(organization.role, "clients.manage");
  const canReadClinical = hasOrganizationPermission(organization.role, "clinical.read");
  const canManageClinical = hasOrganizationPermission(organization.role, "clinical.manage");
  const canManageClinicalMedia = canManageClinical;
  const canIssueDocuments = hasOrganizationPermission(organization.role, "documents.manage");
  const canReadDocuments = canReadClinical;
  const [client] = await db
    .select()
    .from(clients)
    .where(
      and(
        eq(clients.id, id),
        eq(clients.organizationId, organization.id),
        professionalScopeId ? inArray(clients.id, db.select({ id: appointments.clientId }).from(appointments).where(and(eq(appointments.organizationId, organization.id), eq(appointments.professionalId, professionalScopeId)))) : undefined,
      )
    )
    .limit(1);
  if (!client) notFound();
  const [history, entries, packageRows, clinicalMedia, documents] = await Promise.all([db
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      status: appointments.status,
      service: services.name,
      professional: professionals.name,
      notes: appointments.notes,
      cancellationReason: appointments.cancellationReason,
      createdAt: appointments.createdAt,
    })
    .from(appointments)
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .leftJoin(professionals, eq(professionals.id, appointments.professionalId))
    .where(
      and(
        eq(appointments.clientId, client.id),
        eq(appointments.organizationId, organization.id),
        professionalScopeId ? eq(appointments.professionalId, professionalScopeId) : undefined,
      )
    )
    .orderBy(desc(appointments.startsAt)),
    canReadClinical ? db.select({
      id: clientHistoryEntries.id,
      entryType: clientHistoryEntries.entryType,
      title: clientHistoryEntries.title,
      content: clientHistoryEntries.content,
      electronicDocumentId: clientHistoryEntries.electronicDocumentId,
      retailQuoteId: clientHistoryEntries.retailQuoteId,
      occurredAt: clientHistoryEntries.occurredAt,
      createdAt: clientHistoryEntries.createdAt,
      author: users.name,
    }).from(clientHistoryEntries)
      .innerJoin(users, eq(users.id, clientHistoryEntries.authorUserId))
      .where(and(eq(clientHistoryEntries.clientId, client.id), eq(clientHistoryEntries.organizationId, organization.id)))
      .orderBy(desc(clientHistoryEntries.occurredAt)) : Promise.resolve([]),
    db.select({
      id: clientPackages.id,
      packageName: servicePackages.name,
      serviceName: services.name,
      total: clientPackageBalances.totalQuantity,
      used: consumedPackageQuantity,
      purchasedAt: clientPackages.purchasedAt,
      expiresAt: clientPackages.expiresAt,
      status: clientPackages.status,
    }).from(clientPackages)
      .innerJoin(servicePackages, eq(servicePackages.id, clientPackages.packageId))
      .innerJoin(clientPackageBalances, eq(clientPackageBalances.clientPackageId, clientPackages.id))
      .innerJoin(services, eq(services.id, clientPackageBalances.serviceId))
      .where(and(eq(clientPackages.clientId, client.id), eq(clientPackages.organizationId, organization.id)))
      .orderBy(desc(clientPackages.purchasedAt)),
    canReadClinical ? db.select().from(clientClinicalMedia).where(and(eq(clientClinicalMedia.clientId, client.id), eq(clientClinicalMedia.organizationId, organization.id))).orderBy(desc(clientClinicalMedia.capturedAt)) : Promise.resolve([]),
    canReadDocuments ? db.select({
      id: electronicDocuments.id,
      title: electronicDocuments.title,
      documentType: electronicDocuments.documentType,
      workflowType: electronicDocuments.workflowType,
      issuedAt: electronicDocuments.issuedAt,
      signedAt: electronicDocuments.signedAt,
      createdAt: electronicDocuments.createdAt,
      professionalName: professionals.name,
    }).from(electronicDocuments)
      .leftJoin(professionals, eq(professionals.id, electronicDocuments.issuerProfessionalId))
      .where(and(
        eq(electronicDocuments.clientId, client.id),
        eq(electronicDocuments.organizationId, organization.id),
        inArray(electronicDocuments.status, ["issued", "signed"]),
        professionalScopeId ? eq(electronicDocuments.issuerProfessionalId, professionalScopeId) : undefined,
      ))
      .orderBy(desc(electronicDocuments.createdAt)) : Promise.resolve([]),
  ]);
  const packages = new Map<string, { name: string; purchasedAt: Date; expiresAt: Date | null; status: string; balances: typeof packageRows }>();
  for (const row of packageRows) {
    const current = packages.get(row.id) ?? { name: row.packageName, purchasedAt: row.purchasedAt, expiresAt: row.expiresAt, status: row.status, balances: [] };
    current.balances.push(row);
    packages.set(row.id, current);
  }
  const appointmentById = new Map(history.map((item) => [item.id, item]));
  const recordedTimeline = history.length ? await db.select({
    id: auditLogs.id,
    appointmentId: auditLogs.entityId,
    action: auditLogs.action,
    details: auditLogs.details,
    createdAt: auditLogs.createdAt,
    author: users.name,
  }).from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .where(and(
      eq(auditLogs.organizationId, organization.id),
      eq(auditLogs.entityType, "appointment"),
      inArray(auditLogs.entityId, history.map((item) => item.id)),
    ))
    .orderBy(desc(auditLogs.createdAt)) : [];
  const recordedCreations = new Set(recordedTimeline.filter((event) => event.action === "create").map((event) => event.appointmentId));
  const timeline = [
    ...recordedTimeline,
    ...history.filter((appointment) => !recordedCreations.has(appointment.id)).map((appointment) => ({
      id: `appointment-created:${appointment.id}`,
      appointmentId: appointment.id,
      action: "create",
      details: { status: "scheduled", recoveredFromAppointment: true },
      createdAt: appointment.createdAt,
      author: null,
    })),
  ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const isHealth = organization.businessType === "saude";
  const recordLabel = isHealth ? "Prontuário" : "Histórico do cliente";
  const visibleEntries = entries.filter((entry) => !entry.electronicDocumentId);
  const genderLabels: Record<string, string> = { female: "Feminino", male: "Masculino", other: "Outro", not_informed: "Prefere não informar" };
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow={`Histórico de ${organization.clientLabel.toLowerCase()}`}
        title={client.name}
        description={[formatPhone(client.phone), client.email].filter(Boolean).join(" · ") || "Sem contato informado"}
      />
      <section className="panel mb-5">
        <h2 className="text-lg font-extrabold">Dados cadastrais</h2>
        <div className="mt-4 flex flex-col gap-6 sm:flex-row">
          <div className="shrink-0">
            {client.imageUrl
              ? <Image className="size-32 rounded-2xl object-cover" src={client.imageUrl} alt={`Foto de ${client.name}`} width={128} height={128} sizes="128px" />
              : <div className="flex size-32 flex-col items-center justify-center gap-2 rounded-2xl bg-teal-50 text-brand"><span className="text-3xl font-extrabold">{client.name[0]}</span><span className="text-xs">Sem foto</span></div>}
          </div>
          <dl className="grid min-w-0 flex-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Nome completo", client.name],
              ["Telefone", formatPhone(client.phone)],
              ["E-mail", client.email],
              ["Peso", client.weightKg ? `${Number(client.weightKg).toLocaleString("pt-BR")} kg` : null], ["Altura", client.heightCm ? `${Number(client.heightCm).toLocaleString("pt-BR")} cm` : null], ["Data de nascimento", client.birthDate ? new Date(`${client.birthDate}T12:00:00Z`).toLocaleDateString("pt-BR") : null],
              ["Sexo", client.gender ? genderLabels[client.gender] ?? client.gender : null],
              ["CPF", client.cpf],
              ["Estado civil", client.maritalStatus],
              ["Profissão", client.profession],
              ["CEP", client.postalCode],
            ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted">{label}</dt><dd className="break-words font-bold">{value || "Não informado"}</dd></div>)}
            <div className="min-w-0 sm:col-span-2 lg:col-span-3"><dt className="text-muted">Endereço</dt><dd className="whitespace-pre-wrap break-words font-bold">{client.address || "Não informado"}</dd></div>
            <div className="min-w-0 sm:col-span-2 lg:col-span-3"><dt className="text-muted">Observações</dt><dd className="whitespace-pre-wrap break-words font-bold">{client.notes || "Não informadas"}</dd></div>
          </dl>
        </div>
                  {canManage && <div className="mt-5 border-t pt-4"><ModalShell title="Editar dados do cliente" triggerLabel="Editar dados" variant="edit" wide closeOnSuccess>
                    <ActionForm action={updateClient} successMessage="Cliente atualizado com sucesso." className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
                      <input type="hidden" name="id" value={client.id} />
                      <label className="grid min-w-0 gap-2 text-sm font-bold">Nome<input className="field py-2" aria-label="Nome completo" name="name" defaultValue={client.name} required /></label>
                      <label className="grid min-w-0 gap-2 text-sm font-bold">WhatsApp<PhoneInput className="field py-2" aria-label="Telefone" name="phone" defaultValue={client.phone} placeholder="Telefone: (71) 99999-9999" /></label>
                      <label className="grid min-w-0 gap-2 text-sm font-bold">E-mail<input className="field py-2" aria-label="E-mail" name="email" type="email" defaultValue={client.email ?? ""} placeholder="E-mail" /></label>
                      <label className="grid min-w-0 gap-2 text-sm font-bold">Data de nascimento<input className="field py-2" name="birthDate" type="date" defaultValue={client.birthDate ?? ""} aria-label="Data de nascimento" /></label>
                      <label className="grid min-w-0 gap-2 text-sm font-bold">Sexo<select className="field py-2" name="gender" defaultValue={client.gender ?? ""} aria-label="Sexo">
                        <option value="">Sexo não informado</option>
                        <option value="female">Feminino</option><option value="male">Masculino</option><option value="other">Outro</option><option value="not_informed">Prefere não informar</option>
                      </select></label>
                      <div className="min-w-0 sm:col-span-2"><ClientOptionalFields client={client} /></div>
                      <label className="grid min-w-0 gap-2 text-sm font-bold">Observações<textarea className="field min-h-20 py-2" aria-label="Observações" name="notes" defaultValue={client.notes ?? ""} placeholder="Observações" /></label>
                      <EntityImageField currentUrl={client.imageUrl} label={`Foto do ${organization.clientLabel.toLowerCase()}`} />
                      <FormActions editing />
                    </ActionForm>
                  </ModalShell></div>}
      </section>
      {canManage && <PortalDependents organizationId={organization.id} guardianId={client.id} />}
      {canReadClinical && <ClinicalWorkspace clientId={client.id} />}
      {canReadClinical && <CollapsiblePanel title="Fotografias clínicas" id="fotografias-clinicas" open={section === "photos"}>
        <p className="text-sm text-muted">Organize fotos por tratamento, data da visita e vista. Compare a evolução entre visitas do mesmo tratamento.</p>
        {canManageClinicalMedia && <ActionForm action={createClientClinicalMedia} resetOnSuccess={false} successMessage="Fotografia salva. Você pode continuar com a próxima vista." className="mt-5">
          <div className="space-y-5">
          <input type="hidden" name="clientId" value={client.id} />
          <fieldset className="min-w-0 rounded-2xl border border-slate-200 p-4 sm:p-5">
            <legend className="px-2 text-sm font-extrabold">1. Tratamento e visita</legend>
            <div className="grid items-start gap-4 md:grid-cols-2">
              <ClinicalPhotoTreatmentField treatments={[...new Set(clinicalMedia.map(item => item.captureSession).filter((value): value is string => Boolean(value)))]} />
              <div className="grid content-start gap-4">
                <label className="grid gap-1.5 text-sm font-bold">Data da visita<input className="field h-12 font-normal" type="date" name="visitDate" required defaultValue={new Intl.DateTimeFormat("en-CA", { timeZone: organization.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())} /></label>
                <label className="grid gap-1.5 text-sm font-bold">Fase do tratamento<select className="field h-12 font-normal" name="phase"><option value="before">Antes</option><option value="during">Evolução</option><option value="after">Depois</option><option value="clinical">Registro clínico</option></select></label>
              </div>
            </div>
          </fieldset>
          <fieldset className="min-w-0 rounded-2xl border border-slate-200 p-4 sm:p-5">
            <legend className="px-2 text-sm font-extrabold">2. Região e fotografia</legend>
            <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3"><ClinicalPhotoClassificationFields /></div>
            <div className="mt-5 border-t border-slate-100 pt-4"><GuidedClinicalPhotoInput references={clinicalMedia.filter((item) => item.mediaType === "photo" && item.phase === "before").map((item) => ({ id: item.id, src: item.storageProvider === "cloudinary" ? `/api/clinical-media/${item.id}?width=1200` : item.url, label: [item.captureSession, item.bodyRegion, item.viewCode].filter(Boolean).join(" · ") || item.title || "Fotografia Antes" }))} /></div>
            <p className="mt-3 text-xs leading-relaxed text-muted">Repita a distância, a iluminação e a posição da foto de referência. Após salvar, a próxima vista será selecionada.</p>
          </fieldset>
          <fieldset className="min-w-0 rounded-2xl border border-slate-200 p-4 sm:p-5">
            <legend className="px-2 text-sm font-extrabold">3. Uso da imagem e consentimento</legend>
            <div className="grid items-start gap-4 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-bold">Finalidade da imagem<select className="field h-12 font-normal" name="consentPurpose" defaultValue="clinical"><option value="clinical">Uso interno / prontuário</option><option value="client_share">Compartilhar com o cliente</option><option value="marketing">Divulgação / publicidade</option></select></label>
              <label className="grid gap-1.5 text-sm font-bold">Termo assinado (opcional)<select className="field h-12 font-normal" name="consentDocumentId" defaultValue=""><option value="">Sem termo vinculado</option>{documents.filter(doc => doc.signedAt && doc.documentType === "consent" && doc.workflowType === "patient_signature").map(doc => <option key={doc.id} value={doc.id}>{doc.title}</option>)}</select></label>
            </div>
            <label className="mt-4 flex items-start gap-3 text-sm leading-relaxed"><input className="mt-1 shrink-0" name="consentConfirmed" type="checkbox" required />Confirmo o consentimento para a finalidade selecionada.</label>
          </fieldset>
          <details className="rounded-2xl border border-slate-200 p-4 sm:p-5">
            <summary className="cursor-pointer text-sm font-bold">Informações adicionais (opcional)</summary>
            <div className="mt-4 grid items-start gap-4 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-bold">Atendimento relacionado<select className="field h-12 font-normal" name="appointmentId" defaultValue=""><option value="">Sem atendimento vinculado</option>{history.map(item => <option key={item.id} value={item.id}>{item.service} · {formatOrganizationDateTime(item.startsAt, organization.timezone)}</option>)}</select></label>
              <label className="grid gap-1.5 text-sm font-bold">Título ou observação<input className="field h-12 font-normal" name="title" placeholder="Ex.: avaliação facial inicial" /></label>
            </div>
          </details>
          <div className="flex flex-col items-start gap-2 border-t border-slate-200 pt-4"><button className="primary-button w-full sm:w-auto">Salvar e continuar</button><p className="text-xs text-muted">Os dados do tratamento e da visita serão mantidos para a próxima foto.</p></div>
          </div>
        </ActionForm>}
        <ClinicalMediaGallery clientId={client.id} canManage={canManageClinicalMedia} media={clinicalMedia.map((item) => ({
          id: item.id,
          title: item.title,
          phase: item.phase,
          mediaType: item.mediaType,
          captureSession: item.captureSession,
          visitDate: item.visitDate,
          consentDocumentTitle: documents.find(doc => doc.id === item.consentDocumentId)?.title ?? null,
          bodyRegion: item.bodyRegion,
          viewCode: item.viewCode,
          patientPosition: item.patientPosition,
          consentPurpose: item.consentPurpose,
          parentMediaId: item.parentMediaId,
          annotations: Array.isArray(item.annotations) ? item.annotations : [],
          src: item.storageProvider === "cloudinary" ? `/api/clinical-media/${item.id}?width=1600` : item.url,
        }))} />
      </CollapsiblePanel>}
      {canReadDocuments && <CollapsiblePanel title={`Documentos emitidos (${documents.length})`} id="documentos-emitidos">
        <p className="text-sm text-muted">Consulte os documentos do cliente ou use uma receita anterior como base para uma nova emissão.</p>
                  <ClientDocumentList documents={documents} timezone={organization.timezone} canIssue={canIssueDocuments} />
      </CollapsiblePanel>}
      <CollapsiblePanel title="Pacotes e saldos">
        <div className="flex justify-end">
          {canManage && <Link href="/pacotes" className="text-sm font-bold text-brand">Gerenciar pacotes</Link>}
        </div>
        <PaginatedCollection label="Registros" className="mt-4 grid gap-3 md:grid-cols-2">
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
        </PaginatedCollection>
      </CollapsiblePanel>
      {canReadClinical && <CollapsiblePanel title={recordLabel}>
        <p className="text-sm text-muted">Registre evoluções e informações relevantes com autoria e data. Documentos emitidos estão reunidos na seção Documentos emitidos.</p>
        {canManageClinical && <ActionForm action={createClientHistoryEntry} successMessage={`${recordLabel} atualizado com sucesso.`} className="mt-5 grid gap-3">
          <input type="hidden" name="clientId" value={client.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold">Tipo de registro<select className="field" name="entryType" defaultValue={isHealth ? "evolution" : "note"}>
              <option value="note">Anotação</option>
              {isHealth && <option value="evolution">Evolução</option>}
              {isHealth && <option value="anamnesis">Anamnese</option>}
              <option value="document">Documento/registro</option>
            </select></label>
            <label className="grid min-w-0 gap-2 text-sm font-bold">Data e hora do registro<input className="field" name="occurredAt" type="datetime-local" aria-label="Data e hora do registro" /></label>
          </div>
          <label className="grid min-w-0 gap-2 text-sm font-bold">Título<input className="field" name="title" placeholder="Título (opcional)" /></label>
          <label className="grid min-w-0 gap-2 text-sm font-bold">Informações do registro<textarea className="field min-h-28" name="content" required placeholder={isHealth ? "Evolução, observações clínicas e conduta" : "Informações relevantes do atendimento"} /></label>
          <button className="primary-button sm:w-fit">Adicionar ao {recordLabel.toLowerCase()}</button>
        </ActionForm>}
        <PaginatedCollection label="Registros" className="mt-6 divide-y">
          {visibleEntries.map((entry) => entry.electronicDocumentId ? <article key={entry.id} className="grid gap-3 py-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-center">
            <p className="truncate font-extrabold">{entry.title || (entry.entryType === "prescription" ? "Receituário" : "Documento")}</p>
            <span className="text-xs font-bold text-muted md:whitespace-nowrap">{formatOrganizationDateTime(entry.occurredAt, organization.timezone)}</span>
            <Link className="secondary-button justify-center py-2 md:whitespace-nowrap" href={`/api/documents/${entry.electronicDocumentId}/pdf`}>Abrir PDF original</Link>
            {canIssueDocuments && ["prescription", "exam_request"].includes(entry.entryType) ? <Link className="secondary-button justify-center py-2 md:whitespace-nowrap" href={`${entry.entryType === "prescription" ? "/documentos/receitas" : "/documentos/exames"}?reuse=${entry.electronicDocumentId}`}>Criar nova a partir desta</Link> : <span />}
          </article> : <article key={entry.id} className="py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-extrabold">{entry.title || (entry.entryType === "evolution" ? "Evolução" : entry.entryType === "anamnesis" ? "Anamnese" : entry.entryType === "prescription" ? "Receita" : entry.entryType === "exam_request" ? "Solicitação de exames" : "Anotação")}</p>
              <span className="text-xs font-bold text-muted">{formatOrganizationDateTime(entry.occurredAt, organization.timezone)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{entry.content}</p>
            {entry.retailQuoteId && <div className="mt-3 flex flex-wrap gap-2"><Link className="secondary-button" href={`/api/quotes/${entry.retailQuoteId}/pdf`} target="_blank">Abrir orçamento em PDF</Link><Link className="secondary-button" href={`/vendas?quote=${entry.retailQuoteId}#orcamentos`}>Recuperar orçamento</Link></div>}
            <p className="mt-2 text-xs text-muted">Registrado por {entry.author} em {formatOrganizationDateTime(entry.createdAt, organization.timezone)}</p>
          </article>)}
          {!visibleEntries.length && <p className="empty-state">Nenhum registro adicionado.</p>}
        </PaginatedCollection>
      </CollapsiblePanel>}
      <CollapsiblePanel title={`${history.length} ${organization.appointmentLabelPlural.toLowerCase()}`}>
        <div className="flex justify-end">
          <Link href="/clientes" className="text-sm font-bold text-brand">Voltar</Link>
        </div>
        {client.notes && (
          <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">{client.notes}</p>
        )}
        <PaginatedCollection label="Registros" className="mt-5 divide-y">
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
              <div className="flex flex-wrap items-center gap-2"><div className="flex flex-wrap items-center gap-2"><span className="status-pill">{statusLabels[item.status]}</span>{hasOrganizationPermission(organization.role, "appointments.read") && <Link className="secondary-button" href={`/atendimento/${item.id}`}>Abrir atendimento</Link>}</div>{hasOrganizationPermission(organization.role, "appointments.read") && <Link className="secondary-button" href={`/atendimento/${item.id}`}>Abrir atendimento</Link>}</div>
            </article>
          ))}
          {!history.length && <p className="empty-state">Nenhum histórico registrado.</p>}
        </PaginatedCollection>
      </CollapsiblePanel>
      <CollapsiblePanel title="Linha do tempo de agendamentos" className="mb-0">
        <p className="text-sm text-muted">Acompanhe criação, reagendamentos e mudanças de status em ordem cronológica.</p>
        <PaginatedCollection label="Registros" className="mt-5 divide-y">
          {timeline.map((event) => {
            const appointment = event.appointmentId ? appointmentById.get(event.appointmentId) : undefined;
            const details: Record<string, unknown> = event.details ?? {};
            const previousStatus = typeof details.previousStatus === "string" ? details.previousStatus : null;
            const nextStatus = typeof details.status === "string" ? details.status : event.action.startsWith("status:") ? event.action.slice(7) : null;
            const from = typeof details.from === "string" ? new Date(details.from) : null;
            const to = typeof details.to === "string" ? new Date(details.to) : null;
            const title = event.action === "create"
              ? "Agendamento criado"
              : event.action === "reschedule"
                ? "Agendamento reagendado"
                : nextStatus === "confirmed"
                  ? "Agendamento confirmado"
                  : nextStatus === "cancelled"
                    ? "Agendamento cancelado"
                    : nextStatus === "completed"
                      ? "Atendimento concluído"
                      : nextStatus === "no_show"
                        ? "Não comparecimento registrado"
                        : nextStatus === "scheduled"
                          ? "Agendamento marcado como agendado"
                          : "Agendamento atualizado";
            return <article key={event.id} className="relative py-4 pl-6 before:absolute before:left-0 before:top-5 before:size-3 before:rounded-full before:bg-brand">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-extrabold">{title}</p>
                  {appointment && <p className="mt-1 text-sm text-muted">{appointment.service}{appointment.professional ? ` · ${appointment.professional}` : ""}</p>}
                </div>
                <span className="text-xs font-bold text-muted">{formatOrganizationDateTime(event.createdAt, organization.timezone)}</span>
              </div>
              {event.action === "reschedule" && from && to && <p className="mt-2 text-sm">De <strong>{formatOrganizationDateTime(from, organization.timezone)}</strong> para <strong>{formatOrganizationDateTime(to, organization.timezone)}</strong>.</p>}
              {event.action === "reschedule" && (!from || !to) && appointment && <p className="mt-2 text-sm">Novo horário: <strong>{formatOrganizationDateTime(appointment.startsAt, organization.timezone)}</strong>.</p>}
              {previousStatus && nextStatus && <p className="mt-2 text-sm">De <strong>{statusLabels[previousStatus as keyof typeof statusLabels] ?? previousStatus}</strong> para <strong>{statusLabels[nextStatus as keyof typeof statusLabels] ?? nextStatus}</strong>.</p>}
              {typeof details.cancellationReason === "string" && <p className="mt-2 text-sm">Motivo: {details.cancellationReason}</p>}
              <p className="mt-2 text-xs text-muted">{event.author ? `Registrado por ${event.author}` : details.recoveredFromAppointment ? "Registro inicial recuperado do agendamento" : "Registro automático do sistema"}</p>
            </article>;
          })}
          {!timeline.length && <p className="empty-state">Nenhum evento automático registrado.</p>}
        </PaginatedCollection>
      </CollapsiblePanel>
    </div>
  );
}
