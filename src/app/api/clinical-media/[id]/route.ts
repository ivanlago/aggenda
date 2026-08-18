import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { clientClinicalMedia } from "@/db/schema";
import { clinicalImageDeliveryUrl } from "@/lib/cloudinary";
import { requireOrganization } from "@/lib/session";

const allowedWidths = new Set([320, 640, 800, 1200, 1600]);

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { organization } = await requireOrganization();
  const { id } = await context.params;
  const [media] = await db.select().from(clientClinicalMedia).where(and(
    eq(clientClinicalMedia.id, id),
    eq(clientClinicalMedia.organizationId, organization.id),
  )).limit(1);

  if (!media) return NextResponse.json({ error: "Imagem não encontrada." }, { status: 404 });
  if (media.storageProvider !== "cloudinary" || !media.storagePublicId) {
    if (/^https:\/\//i.test(media.url)) return NextResponse.redirect(media.url);
    return NextResponse.json({ error: "Imagem indisponível." }, { status: 404 });
  }

  const requestedWidth = Number.parseInt(new URL(request.url).searchParams.get("width") ?? "800", 10);
  const width = allowedWidths.has(requestedWidth) ? requestedWidth : 800;
  const response = await fetch(clinicalImageDeliveryUrl(media.storagePublicId, width), { cache: "no-store" });
  if (!response.ok || !response.body) return NextResponse.json({ error: "Não foi possível carregar a imagem." }, { status: 502 });

  return new NextResponse(response.body, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": response.headers.get("content-type") ?? media.mimeType ?? "image/jpeg",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
