"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { kitInputSchema } from "@/lib/catalog-kit-input";
import { db } from "@/db";
import { catalogKits, retailProducts, retailProductVariants, services } from "@/db/schema";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";


export async function saveCatalogKit(data: FormData) {
  const { organization, session } = await requireOrganization();
  assertOrganizationPermission(organization.role, "services.manage", organization.teamPermissionOverrides);
  let input: z.infer<typeof kitInputSchema>;
  try {
    const price = String(data.get("price") ?? "").trim();
    input = kitInputSchema.parse({
      id: data.get("id") || undefined, name: data.get("name"), description: data.get("description") ?? "",
      priceInCents: price ? Math.round(Number(price.includes(",") ? price.replace(/\./g, "").replace(",", ".") : price) * 100) : NaN,
      isActive: data.get("isActive") === "on", items: JSON.parse(String(data.get("items") ?? "[]")),
    });
  } catch { return { error: "Preencha nome, preço e pelo menos um item com quantidade válida." }; }
  const keys = new Set(input.items.map(item => `${item.type}:${item.id}`));
  if (keys.size !== input.items.length) return { error: "Cada produto ou serviço deve aparecer apenas uma vez no kit." };
  const kitId = await db.transaction(async tx => {
    const items = [];
    for (const item of input.items) {
      if (item.type === "service") {
        const [service] = await tx.select({ name: services.name }).from(services).where(and(eq(services.id, item.id), eq(services.organizationId, organization.id), eq(services.isActive, true)));
        if (!service) throw new Error("Um serviço não está mais disponível. Revise a composição do kit.");
        items.push({ ...item, name: service.name });
      } else {
        const [product] = await tx.select({ name: retailProducts.name, variant: retailProductVariants.name }).from(retailProductVariants)
          .innerJoin(retailProducts, and(eq(retailProducts.id, retailProductVariants.productId), eq(retailProducts.organizationId, organization.id)))
          .where(and(eq(retailProductVariants.id, item.id), eq(retailProductVariants.organizationId, organization.id), eq(retailProductVariants.isActive, true), eq(retailProducts.isActive, true)));
        if (!product) throw new Error("Um produto não está mais disponível. Revise a composição do kit.");
        items.push({ ...item, name: product.variant === "Padrão" ? product.name : `${product.name} — ${product.variant}` });
      }
    }
    const values = { name: input.name, description: input.description || null, priceInCents: input.priceInCents, isActive: input.isActive, items, updatedAt: new Date() };
    if (input.id) {
      const updated = await tx.update(catalogKits).set(values).where(and(eq(catalogKits.id, input.id), eq(catalogKits.organizationId, organization.id))).returning({ id: catalogKits.id });
      if (!updated.length) throw new Error("Kit não encontrado.");
      return updated[0].id;
    }
    const [created] = await tx.insert(catalogKits).values({ ...values, organizationId: organization.id }).returning({ id: catalogKits.id });
    return created.id;
  });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: input.id ? "catalog_kit.updated" : "catalog_kit.created", entityType: "catalog_kit", entityId: kitId, details: { name: input.name } });
  revalidatePath("/produtos-servicos");
}
