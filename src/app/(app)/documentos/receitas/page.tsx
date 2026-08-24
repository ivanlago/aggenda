import { and, eq } from "drizzle-orm";

import { issueProfessionalDocument } from "@/actions/electronic-documents";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { PrescriptionComposer } from "@/components/prescription-composer";
import { db } from "@/db";
import { clients, documentTemplates, electronicDocuments, professionals } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Receita médica" };

type ReusableMedication = { name: string; presentation: string; route: string; dosage: string; quantity: string; notes: string; tussCode: string };
type ReusablePrescription = { clientId: string; professionalId?: string; kind?: string; observations?: string; includeDate?: boolean; medications?: ReusableMedication[] };

export default async function PrescriptionsPage({ searchParams }: { searchParams: Promise<{ reuse?: string }> }) {
  const { organization } = await requireOrganization();
  const { reuse } = await searchParams;
  const canManage = hasOrganizationPermission(organization.role, "documents.manage");
  const [templates, clientRows, professionalRows, source] = await Promise.all([
    db.select().from(documentTemplates).where(eq(documentTemplates.organizationId, organization.id)),
    db.select({ id: clients.id, name: clients.name, email: clients.email, phone: clients.phone }).from(clients).where(eq(clients.organizationId, organization.id)).orderBy(clients.name),
    db.select({ id: professionals.id, name: professionals.name }).from(professionals).where(eq(professionals.organizationId, organization.id)).orderBy(professionals.name),
    reuse ? db.select({ clientId: electronicDocuments.clientId, professionalId: electronicDocuments.issuerProfessionalId, structuredData: electronicDocuments.structuredData }).from(electronicDocuments).where(and(eq(electronicDocuments.id, reuse), eq(electronicDocuments.organizationId, organization.id), eq(electronicDocuments.documentType, "prescription"))).limit(1) : Promise.resolve([]),
  ]);
  const template = templates.find((item) => item.isActive && item.documentType === "prescription");
  const reused = source[0];
  const structured = reused?.structuredData;
  const initial: ReusablePrescription | null = reused ? {
    clientId: reused.clientId,
    professionalId: reused.professionalId ?? undefined,
    kind: typeof structured?.kind === "string" ? structured.kind : undefined,
    observations: typeof structured?.observations === "string" ? structured.observations : undefined,
    includeDate: typeof structured?.includeDate === "boolean" ? structured.includeDate : undefined,
    medications: Array.isArray(structured?.medications) ? structured.medications.filter((item): item is ReusableMedication => {
      if (!item || typeof item !== "object") return false;
      const medication = item as Record<string, unknown>;
      return ["name", "presentation", "route", "dosage", "quantity", "notes", "tussCode"].every((key) => typeof medication[key] === "string");
    }) : undefined,
  } : null;

  return <div className="page-wrap">
    <PageHeader eyebrow="Documentos clínicos" title="Receita médica" description={initial ? "Receita anterior carregada. Revise os medicamentos e dados antes de emitir a nova via." : "Adicione medicamentos, posologia e quantidade e revise o receituário antes da emissão."} />
    {!canManage ? <p className="empty-state">Seu perfil possui acesso somente para consulta de documentos.</p> : template ? <ActionForm action={issueProfessionalDocument} successMessage="Receita emitida." className="panel form-stack">
      <PrescriptionComposer templateId={template.id} organizationName={organization.name} clients={clientRows} professionals={professionalRows} initial={initial} />
    </ActionForm> : <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">O modelo de receita não está ativo. Abra Documentos e restaure a biblioteca inicial.</p>}
  </div>;
}
