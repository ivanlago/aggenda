import { ClientDocumentList } from "@/components/client-document-list";
import { PaginatedCollection } from "@/components/paginated-collection";
import { AppointmentRoomForm } from "@/components/appointment-room-form";
import { ClinicalWorkspace } from "@/components/clinical-workspace";
import { AttendanceWorkspaceTabs } from "@/components/attendance-workspace-tabs";
import { AttendanceTools } from "@/components/attendance-tools";
import { AttendanceClientPackages } from "@/components/attendance-client-packages";
import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { db } from "@/db";
import { clients, rooms, professionals, services, clientHistoryEntries, documentTemplates, electronicDocuments, professionalRegistrations, clinicalConsultationDrafts, clinicalConsultationRecords } from "@/db/schema";
import { requireAttendance } from "@/lib/attendance";
import { hasOrganizationPermission } from "@/lib/permissions";
import { formatOrganizationDateTime } from "@/lib/appointment-safety";
import { formatPhone } from "@/lib/phone";
import { anamnesisAnswersToText, isAnamnesisSchema, type AnamnesisAnswers } from "@/lib/anamnesis";
import { issueAttendanceDocument, updateAttendanceStatus } from "@/actions/attendance";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { PrescriptionComposer } from "@/components/prescription-composer";
import { CertificateComposer } from "@/components/certificate-composer";
import { ExamRequestComposer } from "@/components/exam-request-composer";
import { AttendancePos } from "@/components/attendance-pos";
import { AttendanceItems } from "@/components/attendance-items";
import { CompanionDeclaration } from "@/components/attendance-extras";
import { AppointmentStatusForm } from "@/components/appointment-status-form";
import { AttendanceReturnSettings } from "@/components/attendance-return-settings";

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

export default async function AttendancePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  const { appointment, organization, session } = await requireAttendance(id);
  const canWrite = hasOrganizationPermission(organization.role, "appointments.manage");
  const canReadClinical = hasOrganizationPermission(organization.role, "clinical.read");
  if (!canReadClinical) return <div className="page-wrap"><PageHeader eyebrow="Agenda" title="Atendimento administrativo" description="Gerencie procedimentos, pagamentos e a situação do agendamento." /><Link className="secondary-button mb-5" href="/agenda">Voltar à agenda</Link><AttendanceItems appointmentId={id} /><AttendancePos appointmentId={id} />{canWrite && <section className="panel mt-5"><AppointmentStatusForm action={updateAttendanceStatus} appointmentId={id} initialStatus={appointment.status} initialCancellationReason={appointment.cancellationReason} statuses={statuses} /></section>}</div>;
  const canReadDocuments = hasOrganizationPermission(organization.role, "documents.read") || hasOrganizationPermission(organization.role, "clinical.read");
  const canIssue = hasOrganizationPermission(organization.role, "clinical.issue");
  const [[client], professionalRows, [service], entries, documents, templates, procedures, registrations, roomItems, finalizedRecords, activeDrafts] = await Promise.all([
    db.select().from(clients).where(and(eq(clients.id, appointment.clientId), eq(clients.organizationId, organization.id))).limit(1),
    appointment.professionalId ? db.select().from(professionals).where(and(eq(professionals.id, appointment.professionalId), eq(professionals.organizationId, organization.id))).limit(1) : Promise.resolve([]),
    db.select().from(services).where(and(eq(services.id, appointment.serviceId), eq(services.organizationId, organization.id))).limit(1),
    db.select().from(clientHistoryEntries).where(and(eq(clientHistoryEntries.clientId, appointment.clientId), eq(clientHistoryEntries.organizationId, organization.id))).orderBy(desc(clientHistoryEntries.occurredAt)),
    canReadDocuments ? db.select().from(electronicDocuments).where(and(eq(electronicDocuments.clientId, appointment.clientId), eq(electronicDocuments.organizationId, organization.id))).orderBy(desc(electronicDocuments.createdAt)) : Promise.resolve([]),
    canIssue ? db.select().from(documentTemplates).where(and(eq(documentTemplates.organizationId, organization.id), eq(documentTemplates.isActive, true), eq(documentTemplates.workflowType, "professional_issue"))) : Promise.resolve([]),
    canIssue ? db.select({ id: services.id, name: services.name, shortName: services.shortName, tussCode: services.tussCode, tussReference: services.tussReference, preparation: services.preparation }).from(services).where(and(eq(services.organizationId, organization.id), eq(services.isActive, true))) : Promise.resolve([]),
    appointment.professionalId ? db.select().from(professionalRegistrations).where(and(eq(professionalRegistrations.professionalId, appointment.professionalId), eq(professionalRegistrations.organizationId, organization.id))) : Promise.resolve([]),
    db.select().from(rooms).where(eq(rooms.organizationId, organization.id)).orderBy(rooms.name),
    db.select({ id: clinicalConsultationRecords.id }).from(clinicalConsultationRecords).where(and(eq(clinicalConsultationRecords.organizationId, organization.id), eq(clinicalConsultationRecords.appointmentId, id), eq(clinicalConsultationRecords.kind, "evolution"))),
    db.select({ id: clinicalConsultationDrafts.id }).from(clinicalConsultationDrafts).where(and(eq(clinicalConsultationDrafts.organizationId, organization.id), eq(clinicalConsultationDrafts.appointmentId, id), eq(clinicalConsultationDrafts.status, "active"))),
  ]);
  const professional = professionalRows[0];
  const hasMedicalRegistration = registrations.some(registration => registration.council === "CRM" && registration.registrationNumber && registration.state);
  const canIssueMedical = canIssue && professional?.userId === session.user.id && hasMedicalRegistration;
  const room = roomItems.find(item => item.id === appointment.roomId);
  const historyUrl = `/clientes/${client.id}`;
  const visibleEntries = entries.filter((entry) => !entry.electronicDocumentId || canReadDocuments);
  const anamneses = visibleEntries.filter((entry) => entry.entryType === "anamnesis");
  const anamnesisDocuments = documents.filter((document) => document.documentType === "anamnesis");
  const initial = { clientId: client.id, professionalId: professional?.id ?? "", cpf: client.cpf };
  const clientOptions = [{ id: client.id, name: client.name, cpf: client.cpf, email: client.email, phone: client.phone }];
  const professionalOptions = professional ? [{ id: professional.id, name: professional.name }] : [];
  const price = appointment.priceInCents ?? service.priceInCents ?? 0;
  const dateTime = formatOrganizationDateTime(appointment.startsAt, organization.timezone);
  const documentForm = (children: ReactNode) => <ActionForm action={issueAttendanceDocument} successMessage="Documento salvo no histórico do cliente." className="grid gap-4"><input type="hidden" name="appointmentId" value={id} />{children}</ActionForm>;
  const templateFor = (type: string) => templates.find((template) => template.documentType === type);
  const missingTemplate = <p className="text-sm text-muted">Modelo não disponível. Peça ao administrador da clínica para conferir os modelos e o cadastro profissional.</p>;

  return <div className="page-wrap">
    <PageHeader eyebrow={dateTime} title={client.name} description={`${service.name} · ${professional?.name ?? "Profissional a definir"}`} />
    <nav aria-label="Navegação do atendimento" className="mb-5 flex flex-wrap gap-2"><Link className="secondary-button" href="/agenda">Voltar à agenda</Link><Link className="secondary-button" href={historyUrl}>Cadastro e prontuário</Link></nav>
    <ClinicalWorkspace clientId={client.id} summaryOnly />
    <AttendanceWorkspaceTabs initialTab={tab} tabs={[
      { id: "overview", label: "Visão geral", content: <>
    <div className="grid gap-5 lg:grid-cols-3">
      <section className="panel lg:col-span-2">
        <div className="flex items-start gap-4">{client.imageUrl ? <Image src={client.imageUrl} alt={`Foto de ${client.name}`} width={96} height={96} className="size-24 rounded-xl object-cover" /> : <div className="grid size-24 shrink-0 place-items-center rounded-xl bg-teal-50 text-3xl font-extrabold text-brand">{client.name[0]}</div>}<div className="min-w-0"><h2 className="text-xl font-extrabold">{client.name}</h2><p className="text-sm text-muted">{formatPhone(client.phone) || "Sem telefone"} · {client.email || "Sem e-mail"}</p><p className="mt-1 break-words text-sm font-bold">{client.address || "Endereço não informado"}</p></div></div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-5">{[["Sexo", client.gender ? ({ female: "Feminino", male: "Masculino", other: "Outro", not_informed: "Prefere não informar" } as Record<string, string>)[client.gender] ?? client.gender : null], ["Idade", calculateAge(client.birthDate) != null ? `${calculateAge(client.birthDate)} anos` : null], ["Peso", client.weightKg ? `${Number(client.weightKg).toLocaleString("pt-BR")} kg` : null], ["Altura", client.heightCm ? `${Number(client.heightCm).toLocaleString("pt-BR")} cm` : null], ["Profissão", client.profession], ["Estado civil", client.maritalStatus], ["CPF", client.cpf]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted">{label}</dt><dd className="break-words font-bold">{value || "Não informado"}</dd></div>)}</dl>
        <p className="mt-4 whitespace-pre-wrap rounded-xl bg-amber-50 p-3 text-sm"><strong>Observações do cadastro:</strong> {client.notes || "Nenhuma observação registrada."}</p>
      </section>
      <section className="panel"><h2 className="text-lg font-extrabold">Profissional e procedimento</h2><p className="mt-3 text-sm"><strong>Sala:</strong> {room?.name ?? "Sem sala atribuída"}</p>{canWrite && <div className="mt-3"><AppointmentRoomForm appointmentId={appointment.id} roomId={appointment.roomId} rooms={roomItems} /></div>}<p className="mt-3 font-bold">{professional?.name || "Sem profissional vinculado"}</p><p className="text-sm text-muted">{professional?.title || professional?.customProfession}</p>{registrations.map((registration) => <p key={registration.id} className="text-sm">{registration.council} {registration.registrationNumber} / {registration.state}</p>)}<p className="mt-3 font-bold">{service.name}</p><p className="text-sm">{service.durationMinutes} minutos · {(price / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>{service.description && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{service.description}</p>}{service.preparation && <p className="mt-2 text-sm"><strong>Preparo:</strong> {service.preparation}</p>}{appointment.notes && <p className="mt-2 whitespace-pre-wrap text-sm"><strong>Agendamento:</strong> {appointment.notes}</p>}</section>
    </div>
        <section className="panel mt-5"><h2 className="text-lg font-extrabold">Encerramento do atendimento</h2><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-muted">Agendamento</dt><dd className="font-bold">{statuses.find(([value]) => value === appointment.status)?.[1]}</dd></div><div><dt className="text-muted">Registro clínico</dt><dd className="font-bold">{finalizedRecords.length ? `${finalizedRecords.length} registro(s) finalizado(s)` : "Ainda não finalizado"}</dd></div><div><dt className="text-muted">Rascunhos</dt><dd className="font-bold">{activeDrafts.length ? "Há rascunho pendente de finalização" : "Sem rascunhos pendentes"}</dd></div></dl><p className="mt-3 text-sm text-muted">Confira o registro na aba Consulta. Pagamento e recebimento são acompanhados separadamente na aba Financeiro.</p>{canWrite && <div className="mt-4"><AppointmentStatusForm action={updateAttendanceStatus} appointmentId={id} initialStatus={appointment.status} initialCancellationReason={appointment.cancellationReason} statuses={statuses} returnSettings={<AttendanceReturnSettings appointment={appointment} timezone={organization.timezone} />} /></div>}</section>
      </> },
      { id: "consultation", label: "Consulta", content: <><ClinicalWorkspace clientId={client.id} appointmentId={id} defaultMode={hasMedicalRegistration ? "medical" : "aesthetic"} hideSummary section="consultation" /><details className="panel mt-5"><summary className="cursor-pointer font-extrabold">Anotações anteriores deste atendimento</summary><p className="mt-2 text-sm text-muted">Registros antigos preservados para consulta. Use o editor da consulta para novos registros e o adendo para corrigir uma evolução finalizada.</p><PaginatedCollection label="Registros" className="mt-3">{visibleEntries.filter(entry => entry.appointmentId === id && entry.entryType !== "anamnesis" && !entry.electronicDocumentId).map(entry => <article className="mt-4 border-t pt-3" key={entry.id}><p className="text-xs text-muted">{formatOrganizationDateTime(entry.occurredAt, organization.timezone)}</p><p className="mt-2 whitespace-pre-wrap text-sm">{entry.content}</p></article>)}</PaginatedCollection></details></> },
      { id: "exams", label: "Fotos e exames", content: <><section className="panel"><h2 className="text-lg font-extrabold">Fotografias clínicas</h2><p className="mt-2 text-sm text-muted">Consulte as sessões e comparações no prontuário do paciente.</p><Link className="secondary-button mt-4" href={`${historyUrl}?section=photos#fotografias-clinicas`}>Abrir fotos clínicas</Link></section><ClinicalWorkspace clientId={client.id} appointmentId={id} hideSummary section="exams" /></> },
      { id: "documents", label: "Documentos", content: <>      <section id="anamnese" className="panel scroll-mt-6 lg:col-span-3"><h2 className="text-lg font-extrabold">Anamneses e informações anteriores</h2><p className="mt-1 text-sm text-muted">Informações registradas anteriormente ou respondidas pelo paciente. A revisão atual da equipe fica no resumo clínico.</p>
        {anamneses.slice(0, 3).map((entry) => <article key={entry.id} className="mt-4 rounded-xl border p-4"><p className="text-xs text-muted">{formatOrganizationDateTime(entry.occurredAt, organization.timezone)}</p><p className="mt-2 whitespace-pre-wrap text-sm">{entry.content}</p></article>)}
        {anamnesisDocuments.slice(0, 3).map((document) => <details key={document.id} className="mt-3 rounded-xl border p-3"><summary className="cursor-pointer font-bold">{document.title} · {document.status === "signed" ? "Assinada" : "Pendente de conclusão"}</summary><p className="mt-3 whitespace-pre-wrap text-sm">{anamnesisText(document)}</p>{document.status === "signed" && <Link className="mt-3 inline-block font-bold text-brand" href={`/api/documents/${document.id}/pdf`}>Abrir anamnese em PDF</Link>}</details>)}
        {!anamneses.length && !anamnesisDocuments.length && <p className="mt-3 text-sm text-muted">Nenhuma anamnese disponível para consulta.</p>}

      </section>
     <section id="documentos" className="mt-5 scroll-mt-6">
      <div className="grid gap-4">
        <AttendanceTools restrictionMessage={canIssueMedical ? undefined : "Receitas, atestados e exames exigem acesso do profissional responsável, permissão de emissão e CRM/UF cadastrados."} availableTools={canIssueMedical ? ["receituario", "atestado", "acompanhamento", "exames"] : ["acompanhamento"]} forms={{
          receituario: canIssue && professional && templateFor("prescription") ? documentForm(<PrescriptionComposer templateId={templateFor("prescription")!.id} organizationName={organization.name} clients={clientOptions} professionals={professionalOptions} initial={initial} fixedParticipants />) : missingTemplate,
          atestado: canIssue && professional && templateFor("certificate") ? documentForm(<CertificateComposer templateId={templateFor("certificate")!.id} clients={clientOptions} professionals={professionalOptions} initial={initial} fixedParticipants />) : missingTemplate,
          acompanhamento: canIssue && professional ? documentForm(<CompanionDeclaration clientName={client.name} date={appointment.startsAt.toLocaleDateString("pt-BR", { timeZone: organization.timezone })} />) : missingTemplate,
          exames: canIssue && professional && templateFor("exam_request") ? documentForm(<ExamRequestComposer templateId={templateFor("exam_request")!.id} organizationName={organization.name} clients={clientOptions} professionals={professionalOptions} procedures={procedures} initial={initial} fixedParticipants />) : missingTemplate,
          orcamento: <AttendancePos appointmentId={id} />,
        }} />
      </div>
      {canReadDocuments && <details className="panel mt-4"><summary className="cursor-pointer font-extrabold">Documentos do cliente</summary><ClientDocumentList documents={documents.filter(document => ["issued", "signed"].includes(document.status))} timezone={organization.timezone} canIssue={canIssue} /></details>}
    </section>
</> },
      { id: "finance", label: "Financeiro", content: <><AttendanceItems appointmentId={id} /><AttendanceClientPackages appointmentId={id} /><AttendancePos appointmentId={id} /></> },
    ]} />
  </div>;
}

function anamnesisText(document: { structuredData: Record<string, unknown> | null; signerResponses: string | null }) {
  if (isAnamnesisSchema(document.structuredData?.schema)) {
    let answers = document.structuredData?.answers;
    if (document.signerResponses) { try { answers = JSON.parse(document.signerResponses); } catch { /* retain structured answers */ } }
    if (answers && typeof answers === "object" && !Array.isArray(answers)) return anamnesisAnswersToText(document.structuredData.schema, answers as AnamnesisAnswers);
  }
  return "Consulte as respostas no documento original. Não há respostas estruturadas disponíveis nesta visualização.";
}
