import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { electronicDocuments } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { getOrganizationProfessionalId, requireOrganization } from "@/lib/session";
import { signatureDatabaseReady } from "@/lib/signatures/document-download";
import { PostgresSignatureRepository } from "@/lib/signatures/postgres-repository";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, organization } = await requireOrganization();
  const { id } = await params;
  const headers = { "Cache-Control": "private, no-store" };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return Response.json({ error: "Documento não encontrado." }, { status: 404, headers });
  }
  if (!hasOrganizationPermission(organization.role, "documents.read") && !hasOrganizationPermission(organization.role, "documents.sign")) {
    return Response.json({ error: "Acesso não autorizado." }, { status: 403, headers });
  }
  const [document] = await db.select({ professionalId: electronicDocuments.issuerProfessionalId }).from(electronicDocuments)
    .where(and(eq(electronicDocuments.organizationId, organization.id), eq(electronicDocuments.id, id))).limit(1);
  if (!document) return Response.json({ error: "Documento não encontrado." }, { status: 404, headers });
  if (!hasOrganizationPermission(organization.role, "documents.read")) {
    const professionalId = await getOrganizationProfessionalId(organization.id, session.user.id);
    if (!professionalId || professionalId !== document.professionalId) {
      return Response.json({ error: "Documento não encontrado." }, { status: 404, headers });
    }
  }
  if (!await signatureDatabaseReady()) return Response.json({ status: null }, { headers });
  const request = await new PostgresSignatureRepository(db).latest(organization.id, id);
  return Response.json(request ? {
    id: request.id, status: request.status, method: request.method,
    createdAt: request.createdAt, updatedAt: request.updatedAt,
  } : { status: null }, { headers });
}
