"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { paymentKindSupported, paymentKinds, paymentProviders } from "@/lib/payment-catalog-policy";
import { financialAccounts, paymentMethods } from "@/db/schema";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export async function savePaymentMethod(form: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.manage");
  const input = z.object({ id: z.union([z.literal(""), z.uuid()]), name: z.string().trim().min(2).max(80), kind: z.enum(paymentKinds), provider: z.enum(paymentProviders), defaultAccountId: z.union([z.literal(""), z.uuid()]) })
    .safeParse({ id: form.get("id") ?? "", name: form.get("name"), kind: form.get("kind"), provider: form.get("provider"), defaultAccountId: form.get("defaultAccountId") ?? "" });
  if (!input.success) return { error: "Informe um nome entre 2 e 80 caracteres." };
  const { id, name, kind, provider, defaultAccountId } = input.data;
  if (!paymentKindSupported(kind, provider)) return { error: "Este tipo de pagamento não é compatível com o provedor selecionado." };
  if (defaultAccountId) {
    const [account] = await db.select({ id: financialAccounts.id }).from(financialAccounts).where(and(eq(financialAccounts.id, defaultAccountId), eq(financialAccounts.organizationId, organization.id), eq(financialAccounts.isActive, true)));
    if (!account) return { error: "Selecione uma conta ativa da empresa." };
  }
  const isActive = form.get("active") === "on";
  try {
    if (id) {
      const [updated] = await db.update(paymentMethods).set({ name, kind, provider, defaultAccountId: defaultAccountId || null, isActive })
        .where(and(eq(paymentMethods.id, id), eq(paymentMethods.organizationId, organization.id))).returning({ id: paymentMethods.id });
      if (!updated) return { error: "Forma de pagamento não encontrada." };
    } else {
      await db.insert(paymentMethods).values({ organizationId: organization.id, name, kind, provider, defaultAccountId: defaultAccountId || null, isActive });
    }
  } catch (error) {
    if (error instanceof Error && (error.cause as { code?: string })?.code === "23505") return { error: "Já existe uma forma de pagamento com esse nome." };
    throw error;
  }
  revalidatePath("/", "layout");
  revalidatePath("/financeiro/formas-de-pagamento");
  revalidatePath("/vendas");
  revalidatePath("/atendimento", "layout");
}
