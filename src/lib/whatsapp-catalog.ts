import { createHmac, timingSafeEqual } from "node:crypto";
import { getPosProducts } from "@/lib/pos-catalog";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { retailProducts, retailProductVariants } from "@/db/schema";

export async function getWhatsAppProducts(organizationId: string) {
  const [rows, details] = await Promise.all([
    getPosProducts(organizationId),
    db.select({ id: retailProductVariants.id, description: retailProducts.description, imageUrl: retailProducts.imageUrl }).from(retailProductVariants).innerJoin(retailProducts, and(eq(retailProducts.id, retailProductVariants.productId), eq(retailProducts.organizationId, organizationId))).where(eq(retailProductVariants.organizationId, organizationId)),
  ]);
  const byId = new Map(details.map(item => [item.id, item]));
  return rows.filter(item => item.stock > 0).map(({ id, label, priceInCents }) => ({ id, label, priceInCents, description: byId.get(id)?.description ?? null, imageUrl: byId.get(id)?.imageUrl ?? null }));
}

export function catalogSignature(organizationId: string, expires: number) {
  const secret = process.env.AGGENDA_INTERNAL_API_KEY;
  if (!secret) throw new Error("Chave interna não configurada.");
  return createHmac("sha256", secret).update(`whatsapp-catalog:${organizationId}:${expires}`).digest("hex");
}

export function validCatalogSignature(organizationId: string, expires: number, signature: string, now = Date.now()) {
  if (!Number.isSafeInteger(expires) || expires < now || expires > now + 25 * 60 * 60 * 1000 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = catalogSignature(organizationId, expires);
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export function catalogDocumentUrl(baseUrl: string, organizationId: string) {
  const expires = Date.now() + 24 * 60 * 60 * 1000;
  const url = new URL(`/api/public/whatsapp-catalog/${organizationId}`, baseUrl);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("signature", catalogSignature(organizationId, expires));
  return url.toString();
}
