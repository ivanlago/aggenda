import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { electronicDocuments, organizations, professionalRegistrations, professionals, professionalSigningIdentities } from "@/db/schema";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";
import { assertMedicalRegistration, requireClinicalClient } from "@/lib/clinical-access";
import { createSignedDocumentPdf } from "@/lib/electronic-documents";
import { localEligibleTypes } from "./local-policy";

export async function professionalSigningContext(documentId: string) {
  const context = await requireOrganization();
  const { organization, session } = context;
  assertOrganizationPermission(organization.role, "documents.sign");
  if (!/^[a-f0-9-]{36}$/i.test(documentId)) throw new Error("Documento inválido.");
  const [row] = await db.select({ document: electronicDocuments, professional: professionals, institution: organizations,
    cpf: professionalSigningIdentities.cpf }).from(electronicDocuments)
    .innerJoin(organizations, eq(organizations.id, electronicDocuments.organizationId))
    .innerJoin(professionals, and(eq(professionals.id, electronicDocuments.issuerProfessionalId), eq(professionals.organizationId, organization.id)))
    .leftJoin(professionalSigningIdentities, and(eq(professionalSigningIdentities.organizationId, organization.id), eq(professionalSigningIdentities.professionalId, professionals.id)))
    .where(and(eq(electronicDocuments.id, documentId), eq(electronicDocuments.organizationId, organization.id))).limit(1);
  if (!row || row.professional.userId !== session.user.id || !row.professional.isActive ||
      row.document.workflowType !== "professional_issue" || row.document.status !== "issued" ||
      !localEligibleTypes.has(row.document.documentType)) throw new Error("Somente o profissional responsável pode assinar este documento.");
  if (row.document.documentType === "prescription" && row.document.structuredData?.kind !== "Receituário simples") {
    throw new Error("Este piloto aceita apenas receituários simples. Receitas de controle especial e antimicrobianos exigem fluxo regulatório próprio.");
  }
  await requireClinicalClient(row.document.clientId);
  await assertMedicalRegistration(organization.id, row.professional.id);
  return { ...context, ...row };
}

export async function professionalSnapshotPdf(row: Awaited<ReturnType<typeof professionalSigningContext>>) {
  const [registration] = await db.select().from(professionalRegistrations).where(and(
    eq(professionalRegistrations.organizationId, row.organization.id), eq(professionalRegistrations.professionalId, row.professional.id),
    eq(professionalRegistrations.council, "CRM"))).limit(1);
  const institution = row.institution, document = row.document;
  return createSignedDocumentPdf({ organizationName: institution.name, organizationLegalName: institution.legalName,
    organizationTaxId: institution.taxId, organizationPhone: institution.phone, organizationWhatsapp: institution.publicWhatsapp,
    organizationEmail: institution.publicEmail, organizationWebsite: institution.publicWebsite, organizationAddress: institution.publicAddress,
    organizationLogoUrl: institution.publicLogoUrl, organizationBrandColor: institution.brandColor,
    title: document.title, documentType: document.documentType, content: document.contentSnapshot,
    signerName: document.signerName, signerEmail: document.signerEmail, contentHash: document.contentHash,
    workflowType: document.workflowType, issuedAt: document.issuedAt, showIssuedDate: document.structuredData?.includeDate !== false,
    professionalName: row.professional.name, professionalRegistration: registration ? `${registration.council} ${registration.registrationNumber}/${registration.state}` : null });
}
