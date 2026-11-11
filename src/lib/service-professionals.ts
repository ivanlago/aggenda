import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { db } from "@/db";
import { professionals, servicesToProfessionals } from "@/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function serviceProfessionalIds(formData: FormData): string[] | null {
  // Forms opened before this field existed must not erase saved associations.
  if (formData.get("professionalLinksSubmitted") !== "1") return null;
  return [...new Set(z.array(z.uuid()).parse(formData.getAll("professionalIds")))];
}

export async function replaceServiceProfessionals(tx: Transaction, organizationId: string, serviceId: string, ids: string[]) {
  const existing = await tx.select({id: servicesToProfessionals.professionalId}).from(servicesToProfessionals).where(and(eq(servicesToProfessionals.organizationId, organizationId), eq(servicesToProfessionals.serviceId, serviceId)));
  const retained = new Set(existing.map(row => row.id));
  if (ids.length) {
    const rows = await tx.select({id: professionals.id, active: professionals.isActive, bookable: professionals.isBookable}).from(professionals).where(and(eq(professionals.organizationId, organizationId), inArray(professionals.id, ids)));
    if (rows.length !== ids.length || rows.some(row => !(row.active && row.bookable) && !retained.has(row.id))) throw new Error("Selecione somente atendentes ativos desta empresa e habilitados para atendimento.");
  }
  await tx.delete(servicesToProfessionals).where(and(eq(servicesToProfessionals.organizationId, organizationId), eq(servicesToProfessionals.serviceId, serviceId)));
  if (ids.length) await tx.insert(servicesToProfessionals).values(ids.map(professionalId => ({organizationId, serviceId, professionalId})));
}
