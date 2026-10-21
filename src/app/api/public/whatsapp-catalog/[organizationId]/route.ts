import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getWhatsAppProducts, validCatalogSignature } from "@/lib/whatsapp-catalog";
import { buildWhatsAppCatalogPdf } from "@/lib/whatsapp-catalog-pdf";
import { catalogThumbnail } from "@/lib/catalog-thumbnail";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const expires = Number(request.nextUrl.searchParams.get("expires"));
  const signature = request.nextUrl.searchParams.get("signature") ?? "";
  if (!z.uuid().safeParse(organizationId).success || !process.env.AGGENDA_INTERNAL_API_KEY || !validCatalogSignature(organizationId, expires, signature)) {
    return NextResponse.json({ error: "Link inválido ou expirado. Solicite um novo catálogo pelo WhatsApp." }, { status: 403 });
  }
  const [organization] = await db.select({ name: organizations.name, timezone: organizations.timezone }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!organization) return NextResponse.json({ error: "Catálogo indisponível." }, { status: 404 });
  const products = await getWhatsAppProducts(organizationId);
  const withPhotos: Array<typeof products[number] & { thumbnail?: Uint8Array }> = [];
  // Bound image work to keep Meta's document fetch responsive on large catalogs.
  for (let index = 0; index < products.length; index += 8) {
    withPhotos.push(...await Promise.all(products.slice(index, index + 8).map(async (product, offset) => ({ ...product, thumbnail: index + offset < 32 ? await catalogThumbnail(product.imageUrl) : undefined }))));
  }
  const bytes = await buildWhatsAppCatalogPdf({ name: organization.name, updatedAt: new Date().toLocaleString("pt-BR", { timeZone: organization.timezone }), products: withPhotos });
  return new Response(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": 'inline; filename="catalogo-produtos.pdf"', "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
