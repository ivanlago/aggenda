"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireOrganization } from "@/lib/session";
import { assertOrganizationPermission } from "@/lib/permissions";
import { parsePackageTemplate } from "@/lib/package-catalog";
import { savePackageTemplate } from "@/lib/package-catalog-repository";

function failure(error: unknown) {
  return { error: error instanceof z.ZodError ? "Revise os campos obrigatórios, as datas e as quantidades." : error instanceof Error && !(error as Error & { cause?: unknown }).cause ? error.message : "Não foi possível salvar o pacote. Tente novamente." };
}
function refresh() { revalidatePath("/pacotes"); revalidatePath("/vendas"); revalidatePath("/clientes"); }

export async function saveServicePackage(data: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "services.manage");
  try {
    const input = parsePackageTemplate(data);
    await savePackageTemplate(db, organization.id, input);
    refresh();
    return input.id ? { warning: "Nova versão salva. O modelo anterior foi desativado; os pacotes já adquiridos foram preservados." } : undefined;
  } catch (error) { return failure(error); }
}
