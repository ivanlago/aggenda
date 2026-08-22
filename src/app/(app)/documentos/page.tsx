import { and, desc, eq } from "drizzle-orm";
import { Download, RefreshCcw, XCircle } from "lucide-react";
import Link from "next/link";

import { cancelElectronicDocument, createDocumentTemplate, installDefaultDocumentTemplates, issueElectronicDocument, issueProfessionalDocument, resendElectronicDocument, restoreDefaultDocumentTemplates, setDocumentTemplateActive, updateDocumentTemplate } from "@/actions/electronic-documents";
import { createAnamnesisTemplate, installAnamnesisTemplates, issueAnamnesis, reviewAnamnesis } from "@/actions/anamnesis";
import { ActionForm } from "@/components/action-form";
import { AnamnesisTemplateBuilder } from "@/components/anamnesis-template-builder";
import { PageHeader } from "@/components/page-header";
import { ExamRequestComposer } from "@/components/exam-request-composer";
import { CertificateComposer } from "@/components/certificate-composer";
import { PrescriptionComposer } from "@/components/prescription-composer";
import { ProfessionalDocumentComposer } from "@/components/professional-document-composer";
import { db } from "@/db";
import { clients, documentTemplates, electronicDocuments, professionals, services } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";
import { isAnamnesisSchema, type AnamnesisAnswers } from "@/lib/anamnesis";

export const metadata = { title: "Emissão de documentos" };

const typeLabels: Record<string, string> = { consent: "Consentimento", contract: "Contrato", anamnesis: "Anamnese", term: "Termo", prescription: "Receituário", report: "Laudo", certificate: "Atestado", declaration: "Declaração", referral: "Encaminhamento", exam_request: "Solicitação de exame", guidance: "Orientações" };
const statusLabels: Record<string, string> = { pending: "Aguardando", viewed: "Visualizado", signed: "Assinado", issued: "Emitido", refused: "Recusado", expired: "Expirado", cancelled: "Cancelado" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ reuse?: string }> }) {
  const { organization } = await requireOrganization();
  const { reuse } = await searchParams;
  const canManage = hasOrganizationPermission(organization.role, "documents.manage");
  const [templates, clientRows, professionalRows, procedureRows, rows] = await Promise.all([
    db.select().from(documentTemplates).where(eq(documentTemplates.organizationId, organization.id)).orderBy(desc(documentTemplates.createdAt)),
    db.select({ id: clients.id, name: clients.name, email: clients.email, phone: clients.phone }).from(clients).where(eq(clients.organizationId, organization.id)).orderBy(clients.name),
    db.select({ id: professionals.id, name: professionals.name }).from(professionals).where(eq(professionals.organizationId, organization.id)).orderBy(professionals.name),
    db.select({ id: services.id, name: services.name, shortName: services.shortName, tussCode: services.tussCode, preparation: services.preparation }).from(services).where(and(eq(services.organizationId, organization.id), eq(services.isActive, true))).orderBy(services.name),
    db.select({ document: electronicDocuments, clientName: clients.name }).from(electronicDocuments).innerJoin(clients, eq(clients.id, electronicDocuments.clientId)).where(eq(electronicDocuments.organizationId, organization.id)).orderBy(desc(electronicDocuments.createdAt)).limit(100),
  ]);
  const activeTemplates = templates.filter((item) => item.isActive);
  const anamnesisTemplates = activeTemplates.filter((item) => item.documentType === "anamnesis" && isAnamnesisSchema(item.responseSchema));
  const patientTemplates = activeTemplates.filter((item) => item.workflowType === "patient_signature" && item.documentType !== "anamnesis");
  const professionalTemplates = activeTemplates.filter((item) => item.workflowType === "professional_issue");
  const prescriptionTemplate = professionalTemplates.find((item) => item.documentType === "prescription");
  const examRequestTemplate = professionalTemplates.find((item) => item.documentType === "exam_request");
  const certificateTemplate = professionalTemplates.find((item) => item.documentType === "certificate");
  const otherProfessionalTemplates = professionalTemplates.filter((item) => !["prescription", "exam_request", "certificate"].includes(item.documentType));
  const [reusedDocument] = reuse ? await db.select({ clientId: electronicDocuments.clientId, professionalId: electronicDocuments.issuerProfessionalId, documentType: electronicDocuments.documentType, structuredData: electronicDocuments.structuredData }).from(electronicDocuments).where(and(eq(electronicDocuments.id, reuse), eq(electronicDocuments.organizationId, organization.id))).limit(1) : [];
  const initialPrescription = reusedDocument?.documentType === "prescription" && reusedDocument.structuredData ? { ...(reusedDocument.structuredData as { kind?: string; observations?: string; includeDate?: boolean; medications?: Array<{ name: string; presentation: string; route: string; dosage: string; quantity: string; notes: string; tussCode: string }> }), clientId: reusedDocument.clientId, professionalId: reusedDocument.professionalId ?? undefined } : null;
  const initialExamRequest = reusedDocument?.documentType === "exam_request" && reusedDocument.structuredData ? { ...(reusedDocument.structuredData as { observations?: string; includeDate?: boolean; exams?: Array<{ name: string; fullName: string; indication: string; tussCode: string; preparation: string }> }), clientId: reusedDocument.clientId, professionalId: reusedDocument.professionalId ?? undefined } : null;

  return <div className="page-wrap">
    <PageHeader eyebrow="Documentos digitais" title="Emissão de documentos" description="Emita documentos clínicos, colete anamneses estruturadas e acompanhe assinaturas em um único fluxo." />
    <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><p className="font-extrabold">Documentos profissionais</p><p className="mt-1">Receituários simples, laudos, atestados e encaminhamentos podem ser emitidos em PDF. Documentos sujeitos a controle especial ou assinatura qualificada devem usar o fluxo regulatório apropriado.</p></div>

    {canManage && <section className="panel form-stack mb-5">
      <div><p className="eyebrow">Anamnese digital</p><h2 className="text-xl font-extrabold">Nova anamnese</h2><p className="mt-1 text-sm text-muted">Envie ao paciente ou abra agora no dispositivo da clínica. As perguntas condicionais aparecem somente quando forem pertinentes.</p></div>
      {anamnesisTemplates.length ? <ActionForm action={issueAnamnesis} successMessage="Anamnese criada." className="grid gap-3 md:grid-cols-2">
        <select className="field" name="templateId" required defaultValue=""><option value="" disabled>Selecione o modelo</option>{anamnesisTemplates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select className="field" name="clientId" required defaultValue=""><option value="" disabled>Selecione o paciente</option>{clientRows.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select className="field" name="professionalId" defaultValue=""><option value="">Profissional responsável (definir na revisão)</option>{professionalRows.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select className="field" name="delivery" defaultValue="email"><option value="email">Enviar link e código por e-mail</option><option value="fill_now">Preencher agora neste dispositivo</option></select>
        <button className="primary-button w-fit md:col-span-2">Iniciar anamnese</button>
      </ActionForm> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">Instale os modelos estruturados abaixo para iniciar o fluxo de anamnese.</div>}
    </section>}

    {canManage && prescriptionTemplate && <ActionForm action={issueProfessionalDocument} successMessage="Receita emitida." className="panel form-stack mb-5">
      <div><p className="eyebrow">Fluxo simplificado</p><h2 className="text-xl font-extrabold">Nova receita</h2><p className="mt-1 text-sm text-muted">Escolha o paciente, adicione os medicamentos e informe posologia e quantidade.</p></div>
      {initialPrescription ? <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-900">Uma cópia editável da receita anterior foi carregada. Ao emitir, será criado um novo documento com a data atual; o original permanecerá intacto.</div> : null}
      <PrescriptionComposer templateId={prescriptionTemplate.id} organizationName={organization.name} clients={clientRows} professionals={professionalRows} initial={initialPrescription} />
    </ActionForm>}

    {canManage && !prescriptionTemplate && <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">Instale a biblioteca inicial Aggenda para habilitar o fluxo simplificado de receita.</div>}

    {canManage && certificateTemplate && <ActionForm action={issueProfessionalDocument} successMessage="Atestado emitido." className="panel form-stack mb-5">
      <div><p className="eyebrow">Fluxo simplificado</p><h2 className="text-xl font-extrabold">Novo atestado médico</h2><p className="mt-1 text-sm text-muted">Preencha os dados do afastamento. O CID somente será incluído quando houver autorização expressa do paciente.</p></div>
      <CertificateComposer templateId={certificateTemplate.id} clients={clientRows} professionals={professionalRows} />
    </ActionForm>}

    {canManage && examRequestTemplate && <ActionForm action={issueProfessionalDocument} successMessage="Solicitação de exames emitida." className="panel form-stack mb-5">
      <div><p className="eyebrow">Fluxo simplificado</p><h2 className="text-xl font-extrabold">Nova solicitação de exames</h2><p className="mt-1 text-sm text-muted">Escolha o paciente, adicione os exames e revise antes de emitir.</p></div>
      {initialExamRequest ? <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-900">Uma cópia editável da solicitação anterior foi carregada. O documento original permanece intacto.</div> : null}
      <ExamRequestComposer templateId={examRequestTemplate.id} organizationName={organization.name} clients={clientRows} professionals={professionalRows} procedures={procedureRows} initial={initialExamRequest} />
    </ActionForm>}

    {canManage && <div className="grid gap-5 xl:grid-cols-2">
      <ActionForm action={createDocumentTemplate} successMessage="Modelo criado." className="panel form-stack">
        <h2 className="text-lg font-extrabold">Novo modelo personalizado</h2>
        <input className="field" name="name" required maxLength={120} placeholder="Nome interno do modelo" />
        <select className="field" name="documentType" defaultValue="consent">{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <input className="field" name="title" required maxLength={180} placeholder="Título exibido no documento" />
        <textarea className="field min-h-64" name="content" required maxLength={30000} placeholder="Conteúdo integral do documento" />
        <p className="text-xs text-muted">Variáveis disponíveis: {"{{cliente}}"}, {"{{clinica}}"}, {"{{profissional}}"} e {"{{data}}"}. O conteúdo é congelado na emissão.</p>
        <button className="primary-button sm:w-fit">Criar modelo</button>
      </ActionForm>

      <div className="panel"><h2 className="text-lg font-extrabold">Biblioteca inicial Aggenda</h2><p className="mt-2 text-sm text-muted">Instale modelos-base editáveis para consentimento, anamnese, receituário, laudo, atestado, declaração e encaminhamento.</p><div className="mt-4 flex flex-wrap gap-2"><ActionForm action={installDefaultDocumentTemplates} successMessage="Biblioteca instalada."><button className="secondary-button">Instalar modelos que estiverem faltando</button></ActionForm><ActionForm action={restoreDefaultDocumentTemplates} successMessage="Modelos originais restaurados."><button className="secondary-button">Restaurar modelos originais</button></ActionForm></div><p className="mt-3 text-xs text-muted">A restauração substitui somente os modelos com os nomes originais da biblioteca. Modelos personalizados e documentos já emitidos são preservados.</p></div>

      <div className="panel form-stack"><div><h2 className="text-lg font-extrabold">Modelos de anamnese</h2><p className="mt-1 text-sm text-muted">Comece com os modelos clínico e estético, já preparados com perguntas condicionais e alertas.</p></div><ActionForm action={installAnamnesisTemplates} successMessage="Modelos estruturados instalados."><button className="secondary-button">Instalar modelos de anamnese</button></ActionForm><details><summary className="cursor-pointer text-sm font-extrabold text-brand">Criar modelo personalizado</summary><ActionForm action={createAnamnesisTemplate} successMessage="Modelo de anamnese criado." className="mt-4 grid gap-3"><AnamnesisTemplateBuilder services={procedureRows.map(({ id, name, shortName }) => ({ id, name, shortName }))} /><button className="primary-button w-fit">Salvar modelo</button></ActionForm></details></div>

      <ActionForm action={issueElectronicDocument} successMessage="Documento enviado para assinatura." className="panel form-stack">
        <h2 className="text-lg font-extrabold">Enviar ao paciente para assinatura</h2>
        <select className="field" name="templateId" required defaultValue=""><option value="" disabled>Selecione o modelo</option>{patientTemplates.map((item) => <option key={item.id} value={item.id}>{item.name} · {typeLabels[item.documentType] ?? item.documentType}</option>)}</select>
        <select className="field" name="clientId" required defaultValue=""><option value="" disabled>Selecione o cliente/paciente</option>{clientRows.map((item) => <option key={item.id} value={item.id}>{item.name}{item.email ? ` · ${item.email}` : ""}</option>)}</select>
        <input className="field" name="signerName" placeholder="Nome do signatário (opcional; usa o cadastro)" />
        <input className="field" name="signerEmail" type="email" placeholder="E-mail (opcional; usa o cadastro)" />
        {!patientTemplates.length && <p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">Crie ou instale um modelo de assinatura do paciente.</p>}
        <button className="primary-button sm:w-fit" disabled={!patientTemplates.length || !clientRows.length}>Gerar e enviar por e-mail</button>
      </ActionForm>

      <ActionForm action={issueProfessionalDocument} successMessage="Documento profissional emitido." className="panel form-stack">
        <h2 className="text-lg font-extrabold">Outros documentos profissionais</h2>
        <ProfessionalDocumentComposer templates={otherProfessionalTemplates.map(({ id, name, title, content, documentType }) => ({ id, name, title, content, documentType }))} organizationName={organization.name} clients={clientRows} professionals={professionalRows} typeLabels={typeLabels} />
        <p className="text-xs text-muted">A TUSS 20 é apenas uma referência de identificação. Indicação e posologia permanecem sob responsabilidade do profissional habilitado.</p>
      </ActionForm>
    </div>}

    <section className="panel mt-5"><h2 className="text-lg font-extrabold">Modelos</h2><div className="mt-4 divide-y">{templates.map((item) => <article className="grid gap-3 py-3 lg:grid-cols-[1fr_auto] lg:items-start" key={item.id}><div><p className="font-bold">{item.name}</p><p className="text-xs text-muted">{typeLabels[item.documentType] ?? item.documentType} · {item.workflowType === "professional_issue" ? "emissão profissional" : "assinatura do paciente"} · {item.isActive ? "ativo" : "inativo"}</p>{canManage && <details className="mt-3"><summary className="cursor-pointer text-sm font-extrabold text-brand">Editar modelo</summary><ActionForm action={updateDocumentTemplate} successMessage="Modelo atualizado." className="mt-3 grid gap-2 rounded-xl border p-3"><input type="hidden" name="id" value={item.id} /><input className="field" name="name" defaultValue={item.name} required /><input className="field" name="title" defaultValue={item.title} required /><textarea className="field min-h-48" name="content" defaultValue={item.content} required /><button className="primary-button sm:w-fit">Salvar conteúdo</button></ActionForm></details>}</div>{canManage && <ActionForm action={setDocumentTemplateActive} successMessage="Modelo atualizado."><input type="hidden" name="id" value={item.id} /><input type="hidden" name="active" value={String(!item.isActive)} /><button className="secondary-button py-2">{item.isActive ? "Desativar" : "Ativar"}</button></ActionForm>}</article>)}{!templates.length && <p className="empty-state">Nenhum modelo criado.</p>}</div></section>

    <section className="panel mt-5"><h2 className="text-lg font-extrabold">Documentos emitidos</h2><div className="mt-4 divide-y">{rows.map(({ document, clientName }) => { const answers = document.structuredData?.answers as AnamnesisAnswers | undefined; const schema = document.structuredData?.schema; const reviewedAt = document.structuredData?.reviewedAt as string | undefined; const alerts = isAnamnesisSchema(schema) && answers ? schema.filter((field) => field.alertWhen && String(answers[field.id] ?? "") === field.alertWhen) : []; return <article className="grid gap-3 py-4 lg:grid-cols-[1fr_auto] lg:items-center" key={document.id}><div><div className="flex flex-wrap items-center gap-2"><p className="font-extrabold">{document.title}</p><span className="status-pill">{statusLabels[document.status] ?? document.status}</span>{reviewedAt ? <span className="status-pill">Revisada</span> : null}{alerts.length ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-extrabold text-amber-900">{alerts.length} alerta(s)</span> : null}</div><p className="mt-1 text-xs text-muted">{clientName} · {typeLabels[document.documentType] ?? document.documentType} · emitido em {document.createdAt.toLocaleString("pt-BR")}</p>{document.signedAt && <p className="mt-1 text-xs font-bold text-emerald-700">Assinado em {document.signedAt.toLocaleString("pt-BR")} · evidência {document.evidenceHash?.slice(0, 12)}…</p>}{document.documentType === "anamnesis" && document.signerResponses ? <details className="mt-2"><summary className="cursor-pointer text-sm font-extrabold text-brand">Revisar respostas</summary><pre className="mt-2 whitespace-pre-wrap rounded-xl border bg-slate-50 p-3 font-sans text-sm leading-6">{document.signerResponses}</pre></details> : null}</div><div className="flex flex-wrap gap-2">{["signed", "issued"].includes(document.status) && <Link className="secondary-button py-2" href={`/api/documents/${document.id}/pdf`}><Download className="mr-2 size-4" />{document.status === "issued" ? "Baixar/Imprimir PDF" : "PDF assinado"}</Link>}{canManage && document.documentType === "anamnesis" && document.status === "signed" && !reviewedAt ? <ActionForm action={reviewAnamnesis} successMessage="Anamnese revisada e vinculada ao prontuário."><input type="hidden" name="id" value={document.id} /><select className="field py-2" name="professionalId" required defaultValue={document.issuerProfessionalId ?? ""}><option value="" disabled>Profissional revisor</option>{professionalRows.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="primary-button mt-2 py-2">Confirmar revisão</button></ActionForm> : null}{canManage && ["pending", "viewed", "expired"].includes(document.status) && <><ActionForm action={resendElectronicDocument} successMessage="Documento reenviado."><input type="hidden" name="id" value={document.id} /><button className="secondary-button py-2"><RefreshCcw className="mr-2 size-4" />Reenviar</button></ActionForm><ActionForm action={cancelElectronicDocument} successMessage="Documento cancelado."><input type="hidden" name="id" value={document.id} /><button className="secondary-button py-2 text-red-700"><XCircle className="mr-2 size-4" />Cancelar</button></ActionForm></>}</div></article>; })}{!rows.length && <p className="empty-state">Nenhum documento emitido.</p>}</div></section>
  </div>;
}
