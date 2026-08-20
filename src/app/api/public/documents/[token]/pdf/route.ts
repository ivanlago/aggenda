import { eq } from "drizzle-orm";

import { db } from "@/db";
import { electronicDocuments, organizations } from "@/db/schema";
import { createSignedDocumentPdf, sha256 } from "@/lib/electronic-documents";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [row] = await db.select({ document: electronicDocuments, organizationName: organizations.name }).from(electronicDocuments).innerJoin(organizations, eq(organizations.id, electronicDocuments.organizationId)).where(eq(electronicDocuments.accessTokenHash, sha256(token))).limit(1);
  if (!row || row.document.status !== "signed") return Response.json({ error: "Documento assinado não encontrado." }, { status: 404 });
  const pdf = await createSignedDocumentPdf({ organizationName: row.organizationName, title: row.document.title, content: row.document.contentSnapshot, signerName: row.document.signerName, signerEmail: row.document.signerEmail, signatureData: row.document.signatureData, signerResponses: row.document.signerResponses, signedAt: row.document.signedAt, signerIpAddress: row.document.signerIpAddress, signerUserAgent: row.document.signerUserAgent, contentHash: row.document.contentHash, evidenceHash: row.document.evidenceHash });
  return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="documento-assinado-${row.document.id}.pdf"`, "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
