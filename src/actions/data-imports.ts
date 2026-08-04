"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { clients, dataImportRows, dataImports, services } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export async function undoDataImport(formData: FormData) {
  const { session, organization } = await requireOrganization();
  const id = String(formData.get("id") ?? "");
  const [item] = await db.select().from(dataImports).where(and(eq(dataImports.id, id), eq(dataImports.organizationId, organization.id))).limit(1);
  if (!item || item.status !== "completed" || item.undoneAt) throw new Error("Esta importação não pode ser desfeita.");
  assertOrganizationPermission(organization.role, item.entityType === "clients" ? "clients.manage" : "services.manage");
  const rows = await db.select().from(dataImportRows).where(eq(dataImportRows.importId, id));
  await db.transaction(async (tx) => {
    for (const row of rows) {
      if (!row.entityId) continue;
      if (row.action === "created") {
        if (item.entityType === "clients") await tx.delete(clients).where(and(eq(clients.id, row.entityId), eq(clients.organizationId, organization.id)));
        else await tx.delete(services).where(and(eq(services.id, row.entityId), eq(services.organizationId, organization.id)));
      } else if (row.action === "updated" && row.previousData) {
        const previous = row.previousData as Record<string, unknown>;
        if (item.entityType === "clients") await tx.update(clients).set({ name: String(previous.name), phone: previous.phone as string | null, email: previous.email as string | null, notes: previous.notes as string | null, updatedAt: new Date() }).where(and(eq(clients.id, row.entityId), eq(clients.organizationId, organization.id)));
        else await tx.update(services).set({ name: String(previous.name), description: previous.description as string | null, durationMinutes: Number(previous.durationMinutes), priceInCents: previous.priceInCents as number | null, isActive: Boolean(previous.isActive), requiresProfessional: Boolean(previous.requiresProfessional), updatedAt: new Date() }).where(and(eq(services.id, row.entityId), eq(services.organizationId, organization.id)));
      }
    }
    await tx.update(dataImports).set({ status: "undone", undoneAt: new Date() }).where(eq(dataImports.id, id));
  });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "undo", entityType: "data_import", entityId: id, details: { importedEntityType: item.entityType } });
  revalidatePath("/dados"); revalidatePath("/clientes"); revalidatePath("/servicos");
}
