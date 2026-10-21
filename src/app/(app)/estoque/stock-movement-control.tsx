import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { inventoryProducts } from "@/db/schema";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";
import { StockMovementForm } from "./stock-movement-form";

export async function StockMovementControl({ productId, lotId }: { productId?: string; lotId?: string }) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "inventory.manage");
  const products = await db.select({ id: inventoryProducts.id, name: inventoryProducts.name }).from(inventoryProducts).where(eq(inventoryProducts.organizationId, organization.id)).orderBy(asc(inventoryProducts.name));
  return <StockMovementForm key={organization.id} products={products} initialProductId={productId} initialLotId={lotId} />;
}
