import { desc, eq } from "drizzle-orm";
import { Download, RefreshCcw, XCircle } from "lucide-react";
import Link from "next/link";

import { cancelElectronicDocument, createDocumentTemplate, duplicateDocumentTemplate, issueProfessionalDocument, resendElectronicDocument, setDocumentTemplateActive, updateDocumentTemplate } from "@/actions/electronic-documents";
import { reviewAnamnesis } from "@/actions/anamnesis";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { ProfessionalDocumentComposer } from "@/components/professional-document-composer";
import { db } from "@/db";
import { clients, documentTemplates, electronicDocuments, professionals } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";
import { isAnamnesisSchema, type AnamnesisAnswers } from "@/lib/anamnesis";

export const metadata = { title: "Emissão de documentos" };

const typeLabels: Record<string, string> = { consent: "Consentimento", contract: "Contrato", anamnesis: "Anamnese", term: "Termo", prescription: "Receituário", report: "Laudo", certificate: "Atestado", declaration: "Declaração", referral: "Encaminhamento", exam_request: "Solicitação de exame", guidance: "Orientações" };
const statusLabels: Record<string, string> = { pending: "Aguardando", viewed: "Visualizado", signed: "Assinado", issued: "Emitido", refused: "Recusado", expired: "Expirado", cancelled: "Cancelado" };

export default async function DocumentsPage() {
  const { organization } = await requireOrganization();
  const canManage = hasOrganizationPermission(organization.role, "documents.manage");
  const [templates, clientRows, professionalRows, rows] = await Promise.all([
    db.select().from(documentTemplates).where(eq(documentTemplates.organizationId, organization.id)).orderBy(desc(documentTemplates.createdAt)),
    db.select({ id: clients.id, name: clients.name, email: clients.email, phone: clients.phone }).from(clients).where(eq(clients.organizationId, organization.id)).orderBy(clients.name),
    db.select({ id: professionals.id, name: professionals.name }).from(professionals).where(eq(professionals.organizationId, organization.id)).orderBy(professionals.name),
    db.select({ document: electronicDocuments, clientName: clients.name }).from(electronicDocuments).innerJoin(clients, eq(clients.id, electronicDocuments.clientId)).where(eq(electronicDocuments.organizationId, organization.id)).orderBy(desc(electronicDocuments.createdAt)).limit(100),
  ]);
  const activeTemplates = templates.filter((item) => item.isActive);
  const professionalTemplates = activeTemplates.filter((item) => item.workflowType === "professional_issue");
  const otherProfessionalTemplates = professionalTemplates.filter((item) => !["prescription", "exam_request", "certificate"].includes(item.documentType));

  return <div className="page-wrap">
    <PageHeader eyebrow="Documentos digitais" title="Emissão de documentos" description="Emita documentos clínicos, colete anamneses estruturadas e acompanhe assinaturas em um único fluxo." />
    <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><p className="font-extrabold">Documentos profissionais</p><p className="mt-1">Receituários simples, laudos, atestados e encaminhamentos podem ser emitidos em PDF. Documentos sujeitos a controle especial ou assinatura qualificada devem usar o fluxo regulatório apropriado.</p></div>

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

      <ActionForm action={issueProfessionalDocument} successMessage="Documento profissional emitido." className="panel form-stack">
        <h2 className="text-lg font-extrabold">Outros documentos profissionais</h2>
        <ProfessionalDocumentComposer templates={otherProfessionalTemplates.map(({ id, name, title, content, documentType }) => ({ id, name, title, content, documentType }))} organizationName={organization.name} clients={clientRows} professionals={professionalRows} typeLabels={typeLabels} />
        <p className="text-xs text-muted">A TUSS 20 é apenas uma referência de identificação. Indicação e posologia permanecem sob responsabilidade do profissional habilitado.</p>
      </ActionForm>
    </div>}

    <section className="panel mt-5"><h2 className="text-lg font-extrabold">Modelos</h2><div className="mt-4 divide-y">{templates.map((item) => <article className="grid gap-3 py-3 lg:grid-cols-[1fr_auto] lg:items-start" key={item.id}><div><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{item.name}</p>{item.isSystemPreset ? <span className="status-pill">Nativo</span> : null}</div><p className="text-xs text-muted">{typeLabels[item.documentType] ?? item.documentType} · {item.workflowType === "professional_issue" ? "emissão profissional" : "assinatura do paciente"} · {item.isActive ? "ativo" : "inativo"}</p>{canManage && !item.isSystemPreset && <details className="mt-3"><summary className="cursor-pointer text-sm font-extrabold text-brand">Editar modelo</summary><ActionForm action={updateDocumentTemplate} successMessage="Modelo atualizado." className="mt-3 grid gap-2 rounded-xl border p-3"><input type="hidden" name="id" value={item.id} /><input className="field" name="name" defaultValue={item.name} required /><input className="field" name="title" defaultValue={item.title} required /><textarea className="field min-h-48" name="content" defaultValue={item.content} required /><button className="primary-button sm:w-fit">Salvar conteúdo</button></ActionForm></details>}</div>{canManage && (item.isSystemPreset ? <ActionForm action={duplicateDocumentTemplate} successMessage="Cópia criada e pronta para personalização."><input type="hidden" name="id" value={item.id} /><button className="secondary-button py-2">Duplicar e personalizar</button></ActionForm> : <ActionForm action={setDocumentTemplateActive} successMessage="Modelo atualizado."><input type="hidden" name="id" value={item.id} /><input type="hidden" name="active" value={String(!item.isActive)} /><button className="secondary-button py-2">{item.isActive ? "Desativar" : "Ativar"}</button></ActionForm>)}</article>)}{!templates.length && <p className="empty-state">Nenhum modelo criado.</p>}</div></section>

    <section className="panel mt-5"><h2 className="text-lg font-extrabold">Documentos emitidos</h2><div className="mt-4 divide-y">{rows.map(({ document, clientName }) => { const answers = document.structuredData?.answers as AnamnesisAnswers | undefined; const schema = document.structuredData?.schema; const reviewedAt = document.structuredData?.reviewedAt as string | undefined; const alerts = isAnamnesisSchema(schema) && answers ? schema.filter((field) => field.alertWhen && String(answers[field.id] ?? "") === field.alertWhen) : []; return <article className="grid gap-3 py-4 lg:grid-cols-[1fr_auto] lg:items-center" key={document.id}><div><div className="flex flex-wrap items-center gap-2"><p className="font-extrabold">{document.title}</p><span className="status-pill">{statusLabels[document.status] ?? document.status}</span>{reviewedAt ? <span className="status-pill">Revisada</span> : null}{alerts.length ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-extrabold text-amber-900">{alerts.length} alerta(s)</span> : null}</div><p className="mt-1 text-xs text-muted">{clientName} · {typeLabels[document.documentType] ?? document.documentType} · emitido em {document.createdAt.toLocaleString("pt-BR")}</p>{document.signedAt && <p className="mt-1 text-xs font-bold text-emerald-700">Assinado em {document.signedAt.toLocaleString("pt-BR")} · evidência {document.evidenceHash?.slice(0, 12)}…</p>}{document.documentType === "anamnesis" && document.signerResponses ? <details className="mt-2"><summary className="cursor-pointer text-sm font-extrabold text-brand">Revisar respostas</summary><pre className="mt-2 whitespace-pre-wrap rounded-xl border bg-slate-50 p-3 font-sans text-sm leading-6">{document.signerResponses}</pre></details> : null}</div><div className="flex flex-wrap gap-2">{["signed", "issued"].includes(document.status) && <Link className="secondary-button py-2" href={`/api/documents/${document.id}/pdf`}><Download className="mr-2 size-4" />{document.status === "issued" ? "Baixar/Imprimir PDF" : "PDF assinado"}</Link>}{canManage && document.documentType === "anamnesis" && document.status === "signed" && !reviewedAt ? <ActionForm action={reviewAnamnesis} successMessage="Anamnese revisada e vinculada ao prontuário."><input type="hidden" name="id" value={document.id} /><select className="field py-2" name="professionalId" required defaultValue={document.issuerProfessionalId ?? ""}><option value="" disabled>Profissional revisor</option>{professionalRows.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="primary-button mt-2 py-2">Confirmar revisão</button></ActionForm> : null}{canManage && ["pending", "viewed", "expired"].includes(document.status) && <><ActionForm action={resendElectronicDocument} successMessage="Documento reenviado."><input type="hidden" name="id" value={document.id} /><button className="secondary-button py-2"><RefreshCcw className="mr-2 size-4" />Reenviar</button></ActionForm><ActionForm action={cancelElectronicDocument} successMessage="Documento cancelado."><input type="hidden" name="id" value={document.id} /><button className="secondary-button py-2 text-red-700"><XCircle className="mr-2 size-4" />Cancelar</button></ActionForm></>}</div></article>; })}{!rows.length && <p className="empty-state">Nenhum documento emitido.</p>}</div></section>
  </div>;
}
