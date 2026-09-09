import { AttendancePos } from "@/components/attendance-pos";
import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { db } from "@/db";
import { clients, professionals, services, clientHistoryEntries, documentTemplates, electronicDocuments, professionalRegistrations } from "@/db/schema";
import { requireAttendance } from "@/lib/attendance";
import { hasOrganizationPermission } from "@/lib/permissions";
import { formatOrganizationDateTime } from "@/lib/appointment-safety";
import { formatPhone } from "@/lib/phone";
import { saveAttendanceNote, issueAttendanceDocument, updateAttendanceStatus } from "@/actions/attendance";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { PrescriptionComposer } from "@/components/prescription-composer";
import { CertificateComposer } from "@/components/certificate-composer";
import { ExamRequestComposer } from "@/components/exam-request-composer";
import { AttendanceQuote, CompanionDeclaration } from "@/components/attendance-extras";
import { AppointmentStatusForm } from "@/components/appointment-status-form";

export const metadata = { title: "Atendimento" };
const statuses = [["scheduled", "Agendado"], ["confirmed", "Confirmado"], ["completed", "Concluído"], ["cancelled", "Cancelado"], ["no_show", "Não compareceu"]] as const;

function calculateAge(birthDate: string | null) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T12:00:00Z`);
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const birthdayPassed = today.getUTCMonth() > birth.getUTCMonth() || (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() >= birth.getUTCDate());
  if (!birthdayPassed) age -= 1;
  return age >= 0 ? age : null;
}

function Panel({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return <details id={id} className="panel scroll-mt-6"><summary className="cursor-pointer text-lg font-extrabold">{title}</summary><div className="mt-4">{children}</div></details>;
}

export default async function AttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { appointment, organization } = await requireAttendance(id);
  const canWrite = hasOrganizationPermission(organization.role, "appointments.manage");
  const canReadDocuments = hasOrganizationPermission(organization.role, "documents.read");
  const canIssue = hasOrganizationPermission(organization.role, "documents.manage");
  const [[client], professionalRows, [service], entries, documents, templates, procedures, registrations] = await Promise.all([
    db.select().from(clients).where(and(eq(clients.id, appointment.clientId), eq(clients.organizationId, organization.id))).limit(1),
    appointment.professionalId ? db.select().from(professionals).where(and(eq(professionals.id, appointment.professionalId), eq(professionals.organizationId, organization.id))).limit(1) : Promise.resolve([]),
    db.select().from(services).where(and(eq(services.id, appointment.serviceId), eq(services.organizationId, organization.id))).limit(1),
    db.select().from(clientHistoryEntries).where(and(eq(clientHistoryEntries.clientId, appointment.clientId), eq(clientHistoryEntries.organizationId, organization.id))).orderBy(desc(clientHistoryEntries.occurredAt)),
    canReadDocuments ? db.select().from(electronicDocuments).where(and(eq(electronicDocuments.clientId, appointment.clientId), eq(electronicDocuments.organizationId, organization.id))).orderBy(desc(electronicDocuments.createdAt)) : Promise.resolve([]),
    canIssue ? db.select().from(documentTemplates).where(and(eq(documentTemplates.organizationId, organization.id), eq(documentTemplates.isActive, true), eq(documentTemplates.workflowType, "professional_issue"))) : Promise.resolve([]),
    canIssue ? db.select({ id: services.id, name: services.name, shortName: services.shortName, tussCode: services.tussCode, preparation: services.preparation }).from(services).where(and(eq(services.organizationId, organization.id), eq(services.isActive, true))) : Promise.resolve([]),
    appointment.professionalId ? db.select().from(professionalRegistrations).where(and(eq(professionalRegistrations.professionalId, appointment.professionalId), eq(professionalRegistrations.organizationId, organization.id))) : Promise.resolve([]),
  ]);
  const professional = professionalRows[0];
  const historyUrl = `/clientes/${client.id}`;
  const visibleEntries = entries.filter((entry) => !entry.electronicDocumentId || canReadDocuments);
  const anamneses = visibleEntries.filter((entry) => entry.entryType === "anamnesis");
  const anamnesisDocuments = documents.filter((document) => document.documentType === "anamnesis");
  const initial = { clientId: client.id, professionalId: professional?.id ?? "", cpf: client.cpf };
  const clientOptions = [{ id: client.id, name: client.name, email: client.email, phone: client.phone }];
  const professionalOptions = professional ? [{ id: professional.id, name: professional.name }] : [];
  const price = appointment.priceInCents ?? service.priceInCents ?? 0;
  const dateTime = formatOrganizationDateTime(appointment.startsAt, organization.timezone);
  const documentForm = (children: ReactNode) => <ActionForm action={issueAttendanceDocument} successMessage="Documento salvo no histórico do cliente." className="grid gap-4"><input type="hidden" name="appointmentId" value={id} />{children}</ActionForm>;
  const templateFor = (type: string) => templates.find((template) => template.documentType === type);
  const missingTemplate = <p className="text-sm text-muted">Modelo não disponível. <Link className="font-bold text-brand" href="/documentos">Gerenciar modelos de documentos</Link></p>;

  return <div className="page-wrap">
    <PageHeader eyebrow={dateTime} title="Atendimento" description={`${client.name} · ${service.name}`} />
    <nav aria-label="Atalhos do atendimento" className="mb-5 flex flex-wrap gap-2">
      <Link className="secondary-button" href="/agenda">Voltar à Agenda</Link>
      <Link className="secondary-button" href={historyUrl}>Cadastro e histórico completo</Link>
      <Link className="secondary-button" href={`${historyUrl}?section=photos#fotografias-clinicas`}>Fotos clínicas e simulações</Link>
      <a className="secondary-button" href="#pdv">Pagto/Venda</a>
      <a className="secondary-button" href="#anamnese">Anamnese</a><a className="secondary-button" href="#anotacoes">Anotações</a><a className="secondary-button" href="#documentos">Documentos e orçamento</a>
    </nav>
    <div className="grid gap-5 lg:grid-cols-3">
      <section className="panel lg:col-span-2">
        <div className="flex items-start gap-4">{client.imageUrl ? <Image src={client.imageUrl} alt={`Foto de ${client.name}`} width={96} height={96} className="size-24 rounded-xl object-cover" /> : <div className="grid size-24 shrink-0 place-items-center rounded-xl bg-teal-50 text-3xl font-extrabold text-brand">{client.name[0]}</div>}<div className="min-w-0"><h2 className="text-xl font-extrabold">{client.name}</h2><p className="text-sm text-muted">{formatPhone(client.phone) || "Sem telefone"} · {client.email || "Sem e-mail"}</p><p className="mt-1 break-words text-sm font-bold">{client.address || "Endereço não informado"}</p></div></div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-5">{[["Sexo", client.gender ? ({ female: "Feminino", male: "Masculino", other: "Outro", not_informed: "Prefere não informar" } as Record<string, string>)[client.gender] ?? client.gender : null], ["Idade", calculateAge(client.birthDate) != null ? `${calculateAge(client.birthDate)} anos` : null], ["Profissão", client.profession], ["Estado civil", client.maritalStatus], ["CPF", client.cpf]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted">{label}</dt><dd className="break-words font-bold">{value || "Não informado"}</dd></div>)}</dl>
        <p className="mt-4 whitespace-pre-wrap rounded-xl bg-amber-50 p-3 text-sm"><strong>Observações do cadastro:</strong> {client.notes || "Nenhuma observação registrada."}</p>
      </section>
      <section className="panel"><h2 className="text-lg font-extrabold">Profissional e procedimento</h2><p className="mt-3 font-bold">{professional?.name || "Sem profissional vinculado"}</p><p className="text-sm text-muted">{professional?.title || professional?.customProfession}</p>{registrations.map((registration) => <p key={registration.id} className="text-sm">{registration.council} {registration.registrationNumber} / {registration.state}</p>)}<p className="mt-3 font-bold">{service.name}</p><p className="text-sm">{service.durationMinutes} minutos · {(price / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>{service.description && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{service.description}</p>}{service.preparation && <p className="mt-2 text-sm"><strong>Preparo:</strong> {service.preparation}</p>}{appointment.notes && <p className="mt-2 whitespace-pre-wrap text-sm"><strong>Agendamento:</strong> {appointment.notes}</p>}</section>
      <section id="anamnese" className="panel scroll-mt-6 lg:col-span-3"><h2 className="text-lg font-extrabold">Anamnese</h2><p className="mt-1 text-sm text-muted">Confira alergias, medicamentos em uso, condições de saúde e procedimentos anteriores registrados.</p>
        {anamneses.slice(0, 3).map((entry) => <article key={entry.id} className="mt-4 rounded-xl border p-4"><p className="text-xs text-muted">{formatOrganizationDateTime(entry.occurredAt, organization.timezone)}</p><p className="mt-2 whitespace-pre-wrap text-sm">{entry.content}</p></article>)}
        {anamnesisDocuments.slice(0, 3).map((document) => <details key={document.id} className="mt-3 rounded-xl border p-3"><summary className="cursor-pointer font-bold">{document.title} · {document.status === "signed" ? "Assinada" : "Pendente de conclusão"}</summary><p className="mt-3 whitespace-pre-wrap text-sm">{document.signerResponses || "Sem respostas registradas."}</p>{document.status === "signed" && <Link className="mt-3 inline-block font-bold text-brand" href={`/api/documents/${document.id}/pdf`}>Abrir anamnese em PDF</Link>}</details>)}
        {!anamneses.length && !anamnesisDocuments.length && <p className="mt-3 text-sm text-muted">Nenhuma anamnese disponível para consulta.</p>}
        {canWrite && <details className="mt-4"><summary className="cursor-pointer font-bold text-brand">+ Registrar / atualizar anamnese</summary><ActionForm action={saveAttendanceNote} successMessage="Anamnese salva." className="mt-3 grid gap-3"><input type="hidden" name="appointmentId" value={id} /><input type="hidden" name="entryType" value="anamnesis" /><label className="grid gap-2 text-sm font-bold">Anamnese atualizada<textarea className="field min-h-40" name="content" required minLength={2} maxLength={30000} placeholder="Queixa e objetivo; alergias; medicamentos; condições de saúde; procedimentos anteriores; demais informações relatadas." /></label><button className="primary-button w-fit">Salvar nova anamnese</button></ActionForm></details>}
      </section>
      <section id="anotacoes" className="panel scroll-mt-6 lg:col-span-3"><h2 className="text-lg font-extrabold">Anotações e evolução</h2>{canWrite && <ActionForm action={saveAttendanceNote} successMessage="Anotação salva no atendimento e no histórico." className="mt-4 grid gap-3"><input type="hidden" name="appointmentId" value={id} /><label className="grid gap-2 text-sm font-bold">Registro do atendimento<textarea className="field min-h-40" name="content" required minLength={2} maxLength={30000} placeholder="Avaliação, procedimento realizado, produtos e lotes utilizados, intercorrências, orientações e plano de retorno." /></label><button className="primary-button w-fit">Salvar anotação</button></ActionForm>}
        {visibleEntries.filter((entry) => entry.appointmentId === id && entry.entryType !== "anamnesis").map((entry) => <article key={entry.id} className="mt-4 border-t pt-3"><p className="text-xs text-muted">{formatOrganizationDateTime(entry.occurredAt, organization.timezone)}</p><p className="mt-2 whitespace-pre-wrap text-sm">{entry.content}</p></article>)}
      </section>
    </div>
    <section id="documentos" className="mt-5 scroll-mt-6"><h2 className="mb-3 text-xl font-extrabold">Documentos e orçamento</h2>
      {canIssue && professional ? <div className="grid gap-4">
        <Panel title="Receituário" id="receituario">{templateFor("prescription") ? documentForm(<PrescriptionComposer templateId={templateFor("prescription")!.id} organizationName={organization.name} clients={clientOptions} professionals={professionalOptions} initial={initial} />) : missingTemplate}</Panel>
        <Panel title="Atestado médico" id="atestado">{templateFor("certificate") ? documentForm(<CertificateComposer templateId={templateFor("certificate")!.id} clients={clientOptions} professionals={professionalOptions} initial={initial} />) : missingTemplate}</Panel>
        <Panel title="Declaração de acompanhamento" id="acompanhamento">{documentForm(<CompanionDeclaration clientName={client.name} date={appointment.startsAt.toLocaleDateString("pt-BR", { timeZone: organization.timezone })} />)}</Panel>
        <Panel title="Guia de exames" id="exames">{templateFor("exam_request") ? documentForm(<ExamRequestComposer templateId={templateFor("exam_request")!.id} organizationName={organization.name} clients={clientOptions} professionals={professionalOptions} procedures={procedures} initial={initial} />) : missingTemplate}</Panel>
        <Panel title="Orçamento" id="orcamento">{documentForm(<AttendanceQuote service={service.name} price={price} />)}</Panel>
      </div> : <p className="panel text-sm text-muted">{!professional ? "Vincule um profissional na Agenda para emitir documentos." : "Seu perfil não possui permissão para emitir documentos."}</p>}
      {canReadDocuments && <section className="panel mt-4"><h3 className="font-extrabold">Documentos do cliente</h3>{documents.filter((document) => ["issued", "signed"].includes(document.status)).map((document) => <div key={document.id} className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3"><div><p className="font-bold">{document.title}</p><p className="text-xs text-muted">{formatOrganizationDateTime(document.createdAt, organization.timezone)}{document.structuredData?.appointmentId === id ? " · Neste atendimento" : ""}</p></div><Link className="secondary-button" href={`/api/documents/${document.id}/pdf`}>Abrir PDF</Link></div>)}</section>}
    </section>
    <AttendancePos appointmentId={id} />
    {canWrite && <section className="panel mt-5"><h2 className="mb-3 text-lg font-extrabold">Situação do atendimento</h2><AppointmentStatusForm action={updateAttendanceStatus} appointmentId={id} initialStatus={appointment.status} initialCancellationReason={appointment.cancellationReason} statuses={statuses} /></section>}
  </div>;
}
