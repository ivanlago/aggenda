import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { auditLogs, clinicalAttachments } from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireClinicalClient } from "@/lib/clinical-access";
import { signatureStorage } from "@/lib/signatures/storage-config";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { organization, session } = await requireOrganization();
  assertOrganizationPermission(organization.role, "clinical.read");
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return new Response("Documento não encontrado.", { status: 404 });
  const [attachment] = await db.select().from(clinicalAttachments).where(and(eq(clinicalAttachments.organizationId, organization.id), eq(clinicalAttachments.id, id))).limit(1);
  if (!attachment) return new Response("Documento não encontrado.", { status: 404 });
  await requireClinicalClient(attachment.clientId);
  let bytes;
  try {
    bytes = await signatureStorage().get(organization.id, attachment.storageKey);
    if (bytes.byteLength !== attachment.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== attachment.sha256) throw new Error();
  } catch { return new Response("Documento indisponível. Contate o suporte.", { status: 503, headers: { "Cache-Control": "private, no-store" } }); }
  await db.insert(auditLogs).values({ organizationId: organization.id, userId: session.user.id, action: "download", entityType: "clinical_attachment", entityId: id });
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="laudo-${id}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" } });
}
