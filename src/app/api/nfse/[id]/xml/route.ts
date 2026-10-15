import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { nfseRequests, nfseRequestEvents } from "@/db/schema";
import { readStoredNfseValue } from "@/lib/nfse/vault";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.read");
  const { id } = await params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) return new Response("Não encontrado", { status: 404 });
  const [document] = await db.select().from(nfseRequests).where(and(eq(nfseRequests.id, id), eq(nfseRequests.organizationId, organization.id))).limit(1);
  if (!document?.encryptedXml || !["authorized", "cancelled", "cancellation_processing", "cancellation_uncertain"].includes(document.status)) return new Response("XML autorizado não disponível", { status: 404 });
  const xml = readStoredNfseValue(organization.id, `${id}/xml`, document.encryptedXml);
  await db.insert(nfseRequestEvents).values({ organizationId: organization.id, requestId: id, userId: session.user.id, type: "xml_downloaded" });
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="nfse-${document.id}.xml"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
