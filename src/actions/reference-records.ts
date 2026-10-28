"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";
import { referenceLabels, type ReferenceRecord } from "@/lib/reference-records";
import { changeReferenceRecord, saveReferenceRecord } from "@/lib/reference-record-repository";

const kindSchema = z.enum(["product_category", "product_subcategory", "service_category", "financial_account", "financial_category", "cost_center"]);
function refresh() { revalidatePath("/estoque"); revalidatePath("/servicos"); revalidatePath("/financeiro"); }
function failure(error: unknown) {
  if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Revise os dados informados." };
  const cause = error instanceof Error ? (error as Error & { cause?: { code?: string }; code?: string }) : undefined;
  if (cause?.code === "23505" || cause?.cause?.code === "23505") return { error: "Já existe um cadastro com esse nome. Use o existente ou escolha outro nome." };
  return { error: error instanceof Error && !cause?.cause ? error.message : "Não foi possível salvar. Revise os dados e tente novamente." };
}

export async function saveReference(data: FormData): Promise<{ record?: ReferenceRecord; error?: string }> {
  const { organization } = await requireOrganization();
  const kind = kindSchema.parse(data.get("kind"));
  assertOrganizationPermission(organization.role, referenceLabels[kind].permission);
  try {
    const id = data.get("id") ? z.uuid().parse(data.get("id")) : undefined;
    const name = z.string().trim().min(2, "Informe ao menos 2 caracteres para o nome.").max(80, "Use até 80 caracteres.").parse(data.get("name"));
    const categoryId = kind === "product_subcategory" && !id ? z.uuid("Selecione uma categoria.").parse(data.get("categoryId")) : undefined;
    const type = kind === "financial_category" && !id ? z.enum(["payable", "receivable"]).parse(data.get("type")) : undefined;
    const accountType = kind === "financial_account" && !id ? z.enum(["bank", "cash", "digital_wallet"]).parse(data.get("accountType")) : undefined;
    const rawBalance = String(data.get("openingBalance") ?? "0").trim() || "0";
    const openingBalanceInCents = kind === "financial_account" && !id ? Math.round(Number(rawBalance.includes(",") ? rawBalance.replaceAll(".", "").replace(",", ".") : rawBalance) * 100) : undefined;
    if (openingBalanceInCents !== undefined && !Number.isSafeInteger(openingBalanceInCents)) return { error: "Informe um saldo inicial válido." };
    const record = await saveReferenceRecord(db, organization.id, { kind, id, name, categoryId, type, accountType, openingBalanceInCents });
    refresh();
    return { record };
  } catch (error) { return failure(error); }
}

export async function changeReference(data: FormData) {
  const { organization } = await requireOrganization();
  const kind = kindSchema.parse(data.get("kind"));
  assertOrganizationPermission(organization.role, referenceLabels[kind].permission);
  try {
    const id = z.uuid().parse(data.get("id"));
    const operation = z.enum(["delete", "activate", "deactivate"]).parse(data.get("operation"));
    await changeReferenceRecord(db, organization.id, kind, id, operation);
    refresh();
  } catch (error) { return failure(error); }
}
