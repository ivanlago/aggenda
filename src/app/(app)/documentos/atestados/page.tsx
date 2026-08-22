import { eq } from "drizzle-orm";

import { issueProfessionalDocument } from "@/actions/electronic-documents";
import { ActionForm } from "@/components/action-form";
import { CertificateComposer } from "@/components/certificate-composer";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { clients, documentTemplates, professionals } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Atestado médico" };

export default async function CertificatesPage() {
  const { organization } = await requireOrganization();
  const canManage = hasOrganizationPermission(organization.role, "documents.manage");
  const [templates, clientRows, professionalRows] = await Promise.all([
    db.select().from(documentTemplates).where(eq(documentTemplates.organizationId, organization.id)),
    db.select({ id: clients.id, name: clients.name, email: clients.email, phone: clients.phone }).from(clients).where(eq(clients.organizationId, organization.id)).orderBy(clients.name),
    db.select({ id: professionals.id, name: professionals.name }).from(professionals).where(eq(professionals.organizationId, organization.id)).orderBy(professionals.name),
  ]);
  const template = templates.find((item) => item.isActive && item.documentType === "certificate");

  return <div className="page-wrap">
    <PageHeader eyebrow="Documentos clínicos" title="Atestado médico" description="Informe o afastamento, revise o texto final e emita o PDF com segurança." />
    {!canManage ? <p className="empty-state">Seu perfil possui acesso somente para consulta de documentos.</p> : template ? <ActionForm action={issueProfessionalDocument} successMessage="Atestado emitido." className="panel form-stack">
      <CertificateComposer templateId={template.id} clients={clientRows} professionals={professionalRows} />
    </ActionForm> : <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">O modelo de atestado não está ativo. Abra Documentos e restaure a biblioteca inicial.</p>}
  </div>;
}
