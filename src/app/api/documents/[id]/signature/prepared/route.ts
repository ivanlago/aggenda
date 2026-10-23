import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { professionalSigningCeremonies } from "@/db/schema";
import { professionalSigningContext } from "@/lib/signatures/professional-context";
import { localSignatureReadiness } from "@/lib/signatures/local-config";
import { assertCeremony, bytesHash } from "@/lib/signatures/local-policy";
import { signatureStorage } from "@/lib/signatures/storage-config";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await professionalSigningContext(id);
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!localSignatureReadiness(context.organization.id).ready) return Response.json({ error: "Piloto indisponível." }, { status: 403, headers });
  const ceremonyId = new URL(request.url).searchParams.get("ceremony") ?? "";
  if (!/^[a-f0-9-]{36}$/i.test(ceremonyId)) return Response.json({ error: "Autorização inválida." }, { status: 404, headers });
  const [ceremony] = await db.select().from(professionalSigningCeremonies).where(and(eq(professionalSigningCeremonies.id, ceremonyId),
    eq(professionalSigningCeremonies.organizationId, context.organization.id), eq(professionalSigningCeremonies.userId, context.session.user.id))).limit(1);
  try {
    if (!ceremony) throw new Error("Autorização não encontrada.");
    if (ceremony.state === "processing" && ceremony.processingStartedAt && ceremony.processingStartedAt.getTime() < Date.now() - 150_000) ceremony.state = "open";
    assertCeremony({ organizationId: context.organization.id, userId: context.session.user.id, documentId: id, sessionHash: bytesHash(context.session.session.id) }, ceremony);
    const pdf = await signatureStorage().get(context.organization.id, ceremony.originalKey);
    if (bytesHash(pdf) !== ceremony.originalHash) throw new Error("Falha de integridade.");
    return new Response(Buffer.from(pdf), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="aggenda-${ceremony.id}.pdf"` } });
  } catch { return Response.json({ error: "Documento preparado indisponível. Prepare uma nova assinatura." }, { status: 409, headers }); }
}
