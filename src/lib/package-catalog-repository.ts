import { and, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { collaboratorItemCommissions, servicePackageItems, servicePackages, services } from "@/db/schema";
import type { PackageTemplateInput } from "./package-catalog";

export async function savePackageTemplate(database: typeof db, organizationId: string, input: PackageTemplateInput) {
  return database.transaction(async (tx) => {
    if (input.id) {
      const [current] = await tx.select().from(servicePackages).where(and(eq(servicePackages.organizationId, organizationId), eq(servicePackages.id, input.id))).for("update");
      if (!current || !current.isActive) throw new Error("O modelo não está mais ativo. Atualize a lista de pacotes.");
    }
    const rows = await tx.select({ id: services.id }).from(services).where(and(eq(services.organizationId, organizationId), eq(services.isActive, true), inArray(services.id, input.items.map((item) => item.serviceId))));
    if (rows.length !== input.items.length) throw new Error("Escolha apenas procedimentos ativos da empresa.");
    // Copy on edit: existing purchases and memberships retain their original model.
    const [created] = await tx.insert(servicePackages).values({ organizationId, name: input.name, description: input.description, priceInCents: input.priceInCents, commissionRateBasisPoints: input.commissionRateBasisPoints ?? 0, executionCommissionRateBasisPoints: input.executionCommissionRateBasisPoints??0, validityDays: input.validityDays }).returning({ id: servicePackages.id });
    await tx.insert(servicePackageItems).values(input.items.map((item) => ({ organizationId, packageId: created.id, ...item })));
    if(input.id){
      const overrides=await tx.select().from(collaboratorItemCommissions).where(and(eq(collaboratorItemCommissions.organizationId,organizationId),eq(collaboratorItemCommissions.itemType,"package"),eq(collaboratorItemCommissions.itemId,input.id)));
      if(overrides.length) await tx.insert(collaboratorItemCommissions).values(overrides.map(row=>({...row,itemId:created.id,updatedAt:new Date()})));
    }
    if (input.id) await tx.update(servicePackages).set({ isActive: false, updatedAt: new Date() }).where(and(eq(servicePackages.organizationId, organizationId), eq(servicePackages.id, input.id)));
    return created.id;
  });
}
