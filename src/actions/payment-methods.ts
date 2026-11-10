"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { paymentKinds } from "@/lib/payment-catalog-policy";
import { financialAccounts, paymentMethods } from "@/db/schema";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export async function savePaymentMethod(form: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.manage");
  const input = z.object({ id: z.union([z.literal(""), z.uuid()]), name: z.string().trim().min(2).max(80), kind: z.enum(paymentKinds), defaultAccountId: z.uuid("Selecione uma conta de pagamento.") })
    .safeParse({ id: form.get("id") ?? "", name: form.get("name"), kind: form.get("kind"), defaultAccountId: form.get("defaultAccountId") ?? "" });
  if (!input.success) return { error: input.error.issues.some(issue => issue.path[0] === "defaultAccountId") ? "Selecione uma conta de pagamento." : "Revise o nome e o tipo." };
  const { id, name, kind, defaultAccountId } = input.data;
  const [account] = await db.select({ id: financialAccounts.id }).from(financialAccounts).where(and(eq(financialAccounts.id, defaultAccountId), eq(financialAccounts.organizationId, organization.id), eq(financialAccounts.isActive, true)));
  if (!account) return { error: "Selecione uma conta ativa da empresa." };
  const isActive = form.get("active") === "on";
  try {
    if (id) {
      const [updated] = await db.update(paymentMethods).set({ name, kind, defaultAccountId, isActive })
        .where(and(eq(paymentMethods.id, id), eq(paymentMethods.organizationId, organization.id))).returning({ id: paymentMethods.id });
      if (!updated) return { error: "Forma de pagamento não encontrada." };
    } else {
      await db.insert(paymentMethods).values({ organizationId: organization.id, name, kind, defaultAccountId, isActive });
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

export async function deletePaymentMethod(form: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.manage");
  const input = z.uuid().safeParse(form.get("id"));
  if (!input.success) return { error: "Forma de pagamento inválida." };
  try {
    const [removed] = await db.delete(paymentMethods).where(and(eq(paymentMethods.id, input.data), eq(paymentMethods.organizationId, organization.id))).returning({ id: paymentMethods.id });
    if (!removed) return { error: "Forma de pagamento não encontrada." };
  } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code;
    if (code === "23503" || code === "23001") return { error: "Esta forma de pagamento possui movimentações vinculadas. Edite o cadastro e desmarque Disponível para novos pagamentos para desativá-la." };
    throw error;
  }
  revalidatePath("/", "layout");
}
