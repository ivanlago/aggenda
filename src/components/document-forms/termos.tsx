import { DocumentNavigation } from "@/components/document-navigation";
import { and, eq } from "drizzle-orm";
import Link from "next/link";

import { issueElectronicDocument } from "@/actions/electronic-documents";
import { ActionForm } from "@/components/action-form";
import { LegalDocumentComposer } from "@/components/legal-document-composer";
import { legalKey } from "@/lib/legal-documents";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { clients, documentTemplates, organizations, professionals, professionalRegistrations, services } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireDocumentOrganization } from "@/lib/document-session";


const allowedTypes = new Set(["consent", "contract", "term"]);

export async function TermsPage({ legal = false }: { legal?: boolean } = {}) {
  const { organization } = await requireDocumentOrganization();
  const canManage = hasOrganizationPermission(organization.role, "documents.manage");
  const [allTemplates, clientRows, professionalRows, registrations, procedureRows, clinicRows] = await Promise.all([
    db.select().from(documentTemplates).where(eq(documentTemplates.organizationId, organization.id)).orderBy(documentTemplates.name),
    db.select({ id: clients.id, name: clients.name, email: clients.email, phone: clients.phone, cpf: clients.cpf, address: clients.address }).from(clients).where(eq(clients.organizationId, organization.id)).orderBy(clients.name),
    db.select({ id: professionals.id, name: professionals.name }).from(professionals).where(and(eq(professionals.organizationId, organization.id), eq(professionals.isActive, true))).orderBy(professionals.name),
    db.select().from(professionalRegistrations).where(eq(professionalRegistrations.organizationId, organization.id)),
    db.select({ id: services.id, name: services.name, description: services.description, preparation: services.preparation, durationMinutes: services.durationMinutes, priceInCents: services.priceInCents }).from(services).where(and(eq(services.organizationId, organization.id), eq(services.isActive, true))).orderBy(services.name),
    db.select({ name: organizations.name, legalName: organizations.legalName, taxId: organizations.taxId, publicAddress: organizations.publicAddress, phone: organizations.phone, publicEmail: organizations.publicEmail }).from(organizations).where(eq(organizations.id, organization.id)).limit(1),
  ]);
  const templates = allTemplates.filter((item) => allowedTypes.has(item.documentType) && item.workflowType === "patient_signature");
  const activeTemplates = templates.filter((item) => item.isActive);
  const automaticTemplates = activeTemplates.filter(item => legalKey(item.responseSchema));
  const manualTemplates = activeTemplates.filter(item => !legalKey(item.responseSchema));
  const professionalOptions = professionalRows.map(item => ({ ...item, registration: registrations.filter(reg => reg.professionalId === item.id).map(reg => `${reg.council} ${reg.registrationNumber}/${reg.state}`).join("; ") }));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: organization.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return <div className="page-wrap">
    <PageHeader eyebrow="Documentos para assinatura" title={legal ? "Jurídicos" : "Termos e contratos"} description="Envie consentimentos, termos e contratos para assinatura eletrônica do paciente." />
    <DocumentNavigation /><div className="mb-5 flex justify-end">
      <Link className="secondary-button" href="/documentos/historico">Ver documentos emitidos</Link>
    </div>

    {canManage && automaticTemplates.length > 0 && clinicRows[0] && <LegalDocumentComposer templates={automaticTemplates.map(({ id, name, title, content, responseSchema }) => ({ id, name, title, content, responseSchema }))} clients={clientRows} professionals={professionalOptions} procedures={procedureRows} organization={clinicRows[0]} today={today} />}
    {canManage && manualTemplates.length > 0 && <details className="panel mt-5"><summary className="cursor-pointer font-extrabold">Enviar modelo personalizado para assinatura</summary><ActionForm action={issueElectronicDocument} successMessage="Documento enviado para assinatura." className="form-stack mt-4"><label className="grid gap-1 text-sm font-bold">Modelo<select className="field" name="templateId" required defaultValue=""><option value="" disabled>Selecione o modelo</option>{manualTemplates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="grid gap-1 text-sm font-bold">Paciente<select className="field" name="clientId" required defaultValue=""><option value="" disabled>Selecione o paciente</option>{clientRows.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="grid min-w-0 gap-2 text-sm font-bold">Nome do signatário (opcional)<input className="field" name="signerName" placeholder="Nome do signatário (usa o cadastro se não informado)" /></label><label className="grid min-w-0 gap-2 text-sm font-bold">E-mail para assinatura (opcional)<input className="field" name="signerEmail" type="email" placeholder="E-mail para assinatura (usa o cadastro se não informado)" /></label><button className="primary-button w-fit">Gerar e enviar por e-mail</button></ActionForm></details>}
    {!canManage && <p className="empty-state">Seu perfil possui acesso somente para consulta de documentos.</p>}

    {canManage && <Link className="secondary-button mt-5" href="/documentos?aba=modelos">Gerenciar modelos de termos e contratos</Link>}

  </div>;
}
