"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { paymentMethods } from "@/db/schema";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export async function savePaymentMethod(form: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.manage");
  const input = z.object({ id: z.union([z.literal(""), z.uuid()]), name: z.string().trim().min(2).max(80) })
    .safeParse({ id: form.get("id") ?? "", name: form.get("name") });
  if (!input.success) return { error: "Informe um nome entre 2 e 80 caracteres." };
  const { id, name } = input.data;
  const isActive = form.get("active") === "on";
  try {
    if (id) {
      const [updated] = await db.update(paymentMethods).set({ name, isActive })
        .where(and(eq(paymentMethods.id, id), eq(paymentMethods.organizationId, organization.id))).returning({ id: paymentMethods.id });
      if (!updated) return { error: "Forma de pagamento não encontrada." };
    } else {
      await db.insert(paymentMethods).values({ organizationId: organization.id, name, isActive });
    }
  } catch (error) {
    if (error instanceof Error && (error.cause as { code?: string })?.code === "23505") return { error: "Já existe uma forma de pagamento com esse nome." };
    throw error;
  }
  revalidatePath("/financeiro/formas-de-pagamento");
  revalidatePath("/vendas");
  revalidatePath("/atendimento", "layout");
}
