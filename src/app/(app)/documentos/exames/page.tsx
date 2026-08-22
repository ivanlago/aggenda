import { and, eq } from "drizzle-orm";

import { issueProfessionalDocument } from "@/actions/electronic-documents";
import { ActionForm } from "@/components/action-form";
import { ExamRequestComposer } from "@/components/exam-request-composer";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { clients, documentTemplates, professionals, services } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Solicitação de exames" };

export default async function ExamRequestsPage() {
  const { organization } = await requireOrganization();
  const canManage = hasOrganizationPermission(organization.role, "documents.manage");
  const [templates, clientRows, professionalRows, procedureRows] = await Promise.all([
    db.select().from(documentTemplates).where(eq(documentTemplates.organizationId, organization.id)),
    db.select({ id: clients.id, name: clients.name, email: clients.email, phone: clients.phone }).from(clients).where(eq(clients.organizationId, organization.id)).orderBy(clients.name),
    db.select({ id: professionals.id, name: professionals.name }).from(professionals).where(eq(professionals.organizationId, organization.id)).orderBy(professionals.name),
    db.select({ id: services.id, name: services.name, shortName: services.shortName, tussCode: services.tussCode, preparation: services.preparation }).from(services).where(and(eq(services.organizationId, organization.id), eq(services.isActive, true))).orderBy(services.name),
  ]);
  const template = templates.find((item) => item.isActive && item.documentType === "exam_request");

  return <div className="page-wrap">
    <PageHeader eyebrow="Documentos clínicos" title="Solicitação de exames" description="Selecione os exames, informe a indicação clínica e revise a solicitação antes da emissão." />
    {!canManage ? <p className="empty-state">Seu perfil possui acesso somente para consulta de documentos.</p> : template ? <ActionForm action={issueProfessionalDocument} successMessage="Solicitação de exames emitida." className="panel form-stack">
      <ExamRequestComposer templateId={template.id} organizationName={organization.name} clients={clientRows} professionals={professionalRows} procedures={procedureRows} />
    </ActionForm> : <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">O modelo de solicitação de exames não está ativo. Abra Documentos e restaure a biblioteca inicial.</p>}
  </div>;
}
