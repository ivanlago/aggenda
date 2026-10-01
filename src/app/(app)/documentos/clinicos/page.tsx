import { and, eq } from "drizzle-orm";
import { issueProfessionalDocument } from "@/actions/electronic-documents";
import { ActionForm } from "@/components/action-form";
import { CompanionDeclarationComposer } from "@/components/companion-declaration-composer";
import { ClinicalDocumentTools } from "@/components/clinical-document-tools";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { clients, documentTemplates, professionals } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireDocumentOrganization } from "@/lib/document-session";
import { AnamnesesPage } from "@/components/document-forms/anamneses";
import { CertificatesPage } from "@/components/document-forms/atestados";
import { PrescriptionsPage } from "@/components/document-forms/receitas";
import { ExamRequestsPage } from "@/components/document-forms/exames";
export const metadata = { title: "Clínicos" };
export default async function ClinicalDocumentsPage() {
 const { organization } = await requireDocumentOrganization();
 const canManage = hasOrganizationPermission(organization.role, "documents.manage");
 const [templates, clientRows, professionalRows] = await Promise.all([
 db.select().from(documentTemplates).where(and(eq(documentTemplates.organizationId, organization.id), eq(documentTemplates.isActive, true), eq(documentTemplates.workflowType, "professional_issue"), eq(documentTemplates.documentType, "companion_declaration"))),
 db.select({ id: clients.id, name: clients.name, email: clients.email, phone: clients.phone }).from(clients).where(eq(clients.organizationId, organization.id)).orderBy(clients.name),
 db.select({ id: professionals.id, name: professionals.name }).from(professionals).where(and(eq(professionals.organizationId, organization.id), eq(professionals.isActive, true))).orderBy(professionals.name),
 ]);
 const companionTemplates = templates.filter(item => item.documentType === "companion_declaration");
 const companionTemplate = companionTemplates.find(item => item.isSystemPreset) ?? companionTemplates[0];
 const initialDate = new Intl.DateTimeFormat("en-CA", { timeZone: organization.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
 const missingTemplate = <p className="empty-state">Modelo indisponível. Confira a biblioteca em Configurações.</p>;
 const readOnly = <p className="empty-state">Seu perfil possui acesso somente para consulta de documentos.</p>;
 return <div className="page-wrap"><PageHeader eyebrow="Documentos" title="Clínicos" description="Selecione uma ferramenta para preparar e emitir o documento do paciente." />
 <ClinicalDocumentTools forms={{
 anamnesis: <AnamnesesPage embedded />,
 certificate: <CertificatesPage embedded />,
 prescription: <PrescriptionsPage embedded searchParams={Promise.resolve({})} />,
 exam_request: <ExamRequestsPage embedded searchParams={Promise.resolve({})} />,
 companion_declaration: canManage ? companionTemplate ? <ActionForm action={issueProfessionalDocument} successMessage="Declaração de acompanhante emitida." className="form-stack"><CompanionDeclarationComposer templateId={companionTemplate.id} clients={clientRows} professionals={professionalRows} organizationName={organization.name} initialDate={initialDate} /></ActionForm> : missingTemplate : readOnly,
 }} /></div>;
}
