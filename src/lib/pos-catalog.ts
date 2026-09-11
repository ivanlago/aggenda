import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { services, servicePackages, retailProductVariants, retailProducts, inventoryProducts } from "@/db/schema";

export async function getPosProducts(organizationId: string) {
  const rows = await db.select({ id: retailProductVariants.id, product: retailProducts.name, variant: retailProductVariants.name, barcode: retailProductVariants.barcode, priceInCents: retailProductVariants.salePriceInCents, stock: inventoryProducts.currentQuantityMillis })
    .from(retailProductVariants).innerJoin(retailProducts, eq(retailProducts.id, retailProductVariants.productId)).innerJoin(inventoryProducts, eq(inventoryProducts.id, retailProductVariants.inventoryProductId))
    .where(and(eq(retailProductVariants.organizationId, organizationId), eq(retailProductVariants.isForSale, true), eq(retailProductVariants.isActive, true), eq(retailProducts.isActive, true), eq(inventoryProducts.isActive, true))).orderBy(retailProducts.name, retailProductVariants.name);
  return rows.map((item) => ({ id: item.id, label: `${item.product} · ${item.variant}`, barcode: item.barcode, priceInCents: item.priceInCents, stock: Math.floor(item.stock / 1000), kind: "product" as const }));
}

export async function getPosOfferings(organizationId: string) {
  const [procedures, packages] = await Promise.all([
    db.select({ id: services.id, name: services.name, price: services.priceInCents }).from(services).where(and(eq(services.organizationId, organizationId), eq(services.isActive, true))).orderBy(services.name),
    db.select({ id: servicePackages.id, name: servicePackages.name, price: servicePackages.priceInCents }).from(servicePackages).where(and(eq(servicePackages.organizationId, organizationId), eq(servicePackages.isActive, true))).orderBy(servicePackages.name),
  ]);
  return [
    ...procedures.map((item) => ({ id: `service:${item.id}`, label: item.name, barcode: null, priceInCents: item.price ?? 0, stock: 10000, kind: "service" as const, unavailableReason: item.price == null ? "Cadastre o preço do procedimento para vendê-lo." : undefined })),
    ...packages.map((item) => ({ id: `package:${item.id}`, label: item.name, barcode: null, priceInCents: item.price, stock: 100, kind: "package" as const })),
  ];
}
