import { and, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { auditLogs, clientPackageBalances, clientPackages, clients, servicePackageItems, servicePackages, services } from "@/db/schema";
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
    const [created] = await tx.insert(servicePackages).values({ organizationId, name: input.name, description: input.description, priceInCents: input.priceInCents, validityDays: input.validityDays }).returning({ id: servicePackages.id });
    await tx.insert(servicePackageItems).values(input.items.map((item) => ({ organizationId, packageId: created.id, ...item })));
    if (input.id) await tx.update(servicePackages).set({ isActive: false, updatedAt: new Date() }).where(and(eq(servicePackages.organizationId, organizationId), eq(servicePackages.id, input.id)));
    return created.id;
  });
}

export type PreviousPackageInput = { registrationId: string; clientId: string; packageId: string; purchasedAt: Date; expiresAt: Date | null; priceInCents: number; reason: string; remaining: { serviceId: string; quantity: number }[] };

export async function registerPreviousPackage(database: typeof db, organizationId: string, userId: string, input: PreviousPackageInput) {
  return database.transaction(async (tx) => {
    const [client] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.organizationId, organizationId), eq(clients.id, input.clientId)));
    const [template] = await tx.select().from(servicePackages).where(and(eq(servicePackages.organizationId, organizationId), eq(servicePackages.id, input.packageId))).for("update");
    if (!client || !template) throw new Error("Cliente ou modelo não encontrado.");
    const items = await tx.select().from(servicePackageItems).where(and(eq(servicePackageItems.organizationId, organizationId), eq(servicePackageItems.packageId, template.id)));
    if (!items.length || input.remaining.length !== items.length || new Set(input.remaining.map((item) => item.serviceId)).size !== items.length || input.remaining.some((balance) => !items.some((item) => item.serviceId === balance.serviceId && Number.isInteger(balance.quantity) && balance.quantity >= 0 && balance.quantity <= item.quantity))) throw new Error("Revise as sessões restantes de cada procedimento.");
    const [assigned] = await tx.insert(clientPackages).values({ id: input.registrationId, organizationId, clientId: input.clientId, packageId: template.id, priceInCents: input.priceInCents, purchasedAt: input.purchasedAt, expiresAt: input.expiresAt, notes: `Pacote anterior — sem novo lançamento financeiro. Motivo: ${input.reason}` }).onConflictDoNothing().returning({ id: clientPackages.id });
    if (!assigned) {
      const [existing] = await tx.select().from(clientPackages).where(and(eq(clientPackages.organizationId, organizationId), eq(clientPackages.id, input.registrationId)));
      if (existing && existing.clientId === input.clientId && existing.packageId === input.packageId && existing.priceInCents === input.priceInCents && existing.purchasedAt.getTime() === input.purchasedAt.getTime() && (existing.expiresAt?.getTime() ?? null) === (input.expiresAt?.getTime() ?? null) && existing.notes === `Pacote anterior — sem novo lançamento financeiro. Motivo: ${input.reason}`) {
        const [audit] = await tx.select({ details: auditLogs.details }).from(auditLogs).where(and(eq(auditLogs.organizationId, organizationId), eq(auditLogs.entityId, existing.id), eq(auditLogs.action, "import_previous"))).limit(1);
        const recorded = audit?.details?.remaining as PreviousPackageInput["remaining"] | undefined;
        if (Array.isArray(recorded) && recorded.length === input.remaining.length && input.remaining.every((item) => recorded.some((original) => original.serviceId === item.serviceId && original.quantity === item.quantity))) return existing.id;
      }
      throw new Error("Este registro já foi utilizado. Feche o formulário e confira os pacotes do cliente.");
    }
    // Preserve the original denominator for per-session values and import the
    // historical counter. No appointment/usage rows or financial revenue are created.
    await tx.insert(clientPackageBalances).values(input.remaining.map((item) => {
      const original = items.find((line) => line.serviceId === item.serviceId)!;
      return { organizationId, clientPackageId: assigned.id, serviceId: item.serviceId, totalQuantity: original.quantity, usedQuantity: original.quantity - item.quantity };
    }));
    await tx.insert(auditLogs).values({ organizationId, userId, action: "import_previous", entityType: "client_package", entityId: assigned.id, details: { ...input, purchasedAt: input.purchasedAt.toISOString(), expiresAt: input.expiresAt?.toISOString() ?? null, financialEntryCreated: false } });
    return assigned.id;
  });
}
