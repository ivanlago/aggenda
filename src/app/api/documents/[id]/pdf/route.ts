import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { electronicDocuments, organizations, professionalRegistrations, professionals } from "@/db/schema";
import { createSignedDocumentPdf } from "@/lib/electronic-documents";
import { assertOrganizationPermission, hasOrganizationPermission } from "@/lib/permissions";
import { getOrganizationProfessionalId, requireOrganization } from "@/lib/session";
import { storedSignaturePdf } from "@/lib/signatures/document-download";
import { SignatureDeliveryUnavailable } from "@/lib/signatures/delivery";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, organization } = await requireOrganization();
  const canReadAll = hasOrganizationPermission(organization.role, "documents.read");
  if (!canReadAll) assertOrganizationPermission(organization.role, "documents.sign");
  const { id } = await params;
  const [row] = await db.select({ document: electronicDocuments, institution: organizations, professionalName: professionals.name }).from(electronicDocuments).innerJoin(organizations, eq(organizations.id, electronicDocuments.organizationId)).leftJoin(professionals, eq(professionals.id, electronicDocuments.issuerProfessionalId)).where(and(eq(electronicDocuments.id, id), eq(electronicDocuments.organizationId, organization.id))).limit(1);
  if (!row || !["signed", "issued"].includes(row.document.status)) return Response.json({ error: "Documento finalizado não encontrado." }, { status: 404 });
  if (!canReadAll) {
    const professionalId = await getOrganizationProfessionalId(organization.id, session.user.id);
    if (!professionalId || professionalId !== row.document.issuerProfessionalId) return Response.json({ error: "Documento finalizado não encontrado." }, { status: 404 });
  }
  try {
    const stored = await storedSignaturePdf(organization.id, row.document.id);
    if (stored) return new Response(Buffer.from(stored), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="documento-${row.document.id}.pdf"`, "Cache-Control": "private, no-store", "X-Document-Id": row.document.id } });
  } catch (error) {
    if (error instanceof SignatureDeliveryUnavailable) return Response.json({ error: error.message }, { status: error.httpStatus, headers: { "Cache-Control": "private, no-store" } });
    throw error;
  }
  const [registration] = row.document.issuerProfessionalId ? await db.select().from(professionalRegistrations).where(and(eq(professionalRegistrations.professionalId, row.document.issuerProfessionalId), eq(professionalRegistrations.organizationId, organization.id))).limit(1) : [];
  const pdf = await createSignedDocumentPdf({
    organizationName: row.institution.name, organizationLegalName: row.institution.legalName, organizationTaxId: row.institution.taxId,
    organizationPhone: row.institution.phone, organizationWhatsapp: row.institution.publicWhatsapp, organizationEmail: row.institution.publicEmail,
    organizationWebsite: row.institution.publicWebsite, organizationAddress: row.institution.publicAddress, organizationLogoUrl: row.institution.publicLogoUrl,
    organizationBrandColor: row.institution.brandColor,
    title: row.document.title, documentType: row.document.documentType, content: row.document.contentSnapshot, signerName: row.document.signerName, signerEmail: row.document.signerEmail,
    signatureData: row.document.signatureData, signerResponses: row.document.signerResponses, signedAt: row.document.signedAt,
    signerIpAddress: row.document.signerIpAddress, signerUserAgent: row.document.signerUserAgent, contentHash: row.document.contentHash,
    evidenceHash: row.document.evidenceHash, workflowType: row.document.workflowType, issuedAt: row.document.issuedAt,
    showIssuedDate: row.document.structuredData?.includeDate !== false,
    professionalName: row.professionalName, professionalRegistration: registration ? [registration.council, registration.registrationNumber, registration.state].filter(Boolean).join(" ") : null,
  });
  return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="documento-${row.document.id}.pdf"`, "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache", "X-Document-Id": row.document.id } });
}
