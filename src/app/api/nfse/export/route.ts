import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { nfseRequests, nfseRequestEvents } from "@/db/schema";
import { fiscalArchive, type FiscalArchiveFile } from "@/lib/nfse/archive";
import { readStoredNfseValue } from "@/lib/nfse/vault";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.read");
  const params = new URL(request.url).searchParams;
  const from = params.get("from") ?? ""; const to = params.get("to") ?? "";
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!valid(from) || !valid(to)) return new Response("Informe datas válidas.", { status: 400 });
  // UTC explicitly matches the dates presented in the export form.
  const start = new Date(`${from}T00:00:00Z`); const end = new Date(`${to}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 1);
  if (end <= start || end.getTime() - start.getTime() > 31 * 86400000) return new Response("Escolha um período de até 31 dias.", { status: 400 });
  const rows = await db.select({ id: nfseRequests.id, status: nfseRequests.status }).from(nfseRequests).where(and(eq(nfseRequests.organizationId, organization.id), eq(nfseRequests.environment, "sandbox"), gte(nfseRequests.createdAt, start), lt(nfseRequests.createdAt, end), inArray(nfseRequests.status, ["authorized", "cancelled", "cancellation_processing", "cancellation_uncertain"]))).orderBy(asc(nfseRequests.createdAt)).limit(501);
  if (!rows.length) return new Response("Nenhuma nota disponível nesse período.", { status: 404 });
  if (rows.length > 500) return new Response("Mais de 500 notas. Escolha um período menor.", { status: 413 });
  const files: FiscalArchiveFile[] = []; let bytes = 0;
  for (const row of rows) {
    const [stored] = await db.select({ status: nfseRequests.status, xml: nfseRequests.encryptedXml, event: nfseRequests.encryptedEvent }).from(nfseRequests).where(and(eq(nfseRequests.id, row.id), eq(nfseRequests.organizationId, organization.id))).limit(1);
    if (!stored?.xml) return new Response("Um documento selecionado está indisponível. Tente novamente.", { status: 409 });
    if (stored.status === "cancelled" && !stored.event) return new Response("Um cancelamento selecionado está incompleto. Tente novamente.", { status: 409 });
    const xml = readStoredNfseValue(organization.id, `${row.id}/xml`, stored.xml);
    const eventXml = stored.event ? readStoredNfseValue(organization.id, `${row.id}/event`, stored.event) : undefined;
    bytes += Buffer.byteLength(xml) + Buffer.byteLength(eventXml ?? "");
    if (bytes > 25 * 1024 * 1024) return new Response("Exportação acima de 25 MB. Escolha um período menor.", { status: 413 });
    files.push({ id: row.id, status: stored.status, xml, eventXml });
  }
  const zip = await fiscalArchive(files);
  await db.insert(nfseRequestEvents).values(rows.map((row) => ({ organizationId: organization.id, requestId: row.id, userId: session.user.id, type: "xml_exported" })));
  return new Response(new Uint8Array(zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="nfse-${from}-${to}.zip"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
