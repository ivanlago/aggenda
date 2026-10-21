"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { serviceCategories, services } from "@/db/schema";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export async function saveServiceCategory(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "services.manage");
  const name = z.string().trim().min(2, "Informe ao menos 2 caracteres.").max(80).parse(formData.get("name"));
  const rawId = formData.get("id");
  if (rawId) {
    const id = z.uuid().parse(rawId);
    await db.update(serviceCategories).set({ name }).where(and(eq(serviceCategories.id, id), eq(serviceCategories.organizationId, organization.id)));
  } else {
    await db.insert(serviceCategories).values({ organizationId: organization.id, name });
  }
  revalidatePath("/servicos");
}

export async function deleteServiceCategory(formData: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "services.manage");
  const id = z.uuid().parse(formData.get("id"));
  await db.transaction(async tx => {
    // Lock the category before detaching services, including concurrent assignments.
    const [category] = await tx.select().from(serviceCategories).where(and(eq(serviceCategories.id, id), eq(serviceCategories.organizationId, organization.id))).for("update");
    if (!category) throw new Error("Categoria não encontrada.");
    await tx.update(services).set({ categoryId: null, updatedAt: new Date() }).where(and(eq(services.organizationId, organization.id), eq(services.categoryId, id)));
    await tx.delete(serviceCategories).where(and(eq(serviceCategories.id, id), eq(serviceCategories.organizationId, organization.id)));
  });
  revalidatePath("/servicos");
}
