import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { electronicDocuments, organizations, professionalRegistrations, professionals } from "@/db/schema";
import { createSignedDocumentPdf } from "@/lib/electronic-documents";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "documents.read");
  const { id } = await params;
  const [row] = await db.select({ document: electronicDocuments, institution: organizations, professionalName: professionals.name }).from(electronicDocuments).innerJoin(organizations, eq(organizations.id, electronicDocuments.organizationId)).leftJoin(professionals, eq(professionals.id, electronicDocuments.issuerProfessionalId)).where(and(eq(electronicDocuments.id, id), eq(electronicDocuments.organizationId, organization.id))).limit(1);
  if (!row || !["signed", "issued"].includes(row.document.status)) return Response.json({ error: "Documento finalizado não encontrado." }, { status: 404 });
  const [registration] = row.document.issuerProfessionalId ? await db.select().from(professionalRegistrations).where(and(eq(professionalRegistrations.professionalId, row.document.issuerProfessionalId), eq(professionalRegistrations.organizationId, organization.id))).limit(1) : [];
  const pdf = await createSignedDocumentPdf({
    organizationName: row.institution.name, organizationLegalName: row.institution.legalName, organizationTaxId: row.institution.taxId,
    organizationPhone: row.institution.phone, organizationWhatsapp: row.institution.publicWhatsapp, organizationEmail: row.institution.publicEmail,
    organizationWebsite: row.institution.publicWebsite, organizationAddress: row.institution.publicAddress, organizationLogoUrl: row.institution.publicLogoUrl,
    organizationBrandColor: row.institution.brandColor, organizationFooter: row.institution.documentFooter,
    title: row.document.title, content: row.document.contentSnapshot, signerName: row.document.signerName, signerEmail: row.document.signerEmail,
    signatureData: row.document.signatureData, signerResponses: row.document.signerResponses, signedAt: row.document.signedAt,
    signerIpAddress: row.document.signerIpAddress, signerUserAgent: row.document.signerUserAgent, contentHash: row.document.contentHash,
    evidenceHash: row.document.evidenceHash, workflowType: row.document.workflowType, issuedAt: row.document.issuedAt,
    professionalName: row.professionalName, professionalRegistration: registration ? [registration.council, registration.registrationNumber, registration.state].filter(Boolean).join(" ") : null,
  });
  return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="documento-${row.document.id}.pdf"`, "Cache-Control": "private, no-store" } });
}
