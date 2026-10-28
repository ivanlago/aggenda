"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireOrganization } from "@/lib/session";
import { assertOrganizationPermission } from "@/lib/permissions";
import { organizationDate, parseOrganizationDateTime } from "@/lib/organization-time";
import { packageAmount, parsePackageTemplate } from "@/lib/package-catalog";
import { registerPreviousPackage, savePackageTemplate } from "@/lib/package-catalog-repository";

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

export async function importPreviousPackage(data: FormData) {
  const { organization, session } = await requireOrganization();
  assertOrganizationPermission(organization.role, "clients.manage");
  try {
    if (data.get("confirmPrevious") !== "on") throw new Error("Confirme que o pacote foi adquirido anteriormente.");
    const registrationId = z.uuid().parse(data.get("registrationId"));
    const clientId = z.uuid().parse(data.get("clientId")), packageId = z.uuid().parse(data.get("packageId"));
    const purchasedOn = z.iso.date().parse(data.get("purchasedOn"));
    if (purchasedOn > organizationDate(new Date(), organization.timezone)) throw new Error("A aquisição de um pacote anterior não pode estar no futuro.");
    const expiry = String(data.get("expiresOn") ?? "");
    if (expiry && z.iso.date().parse(expiry) < purchasedOn) throw new Error("A validade não pode terminar antes da aquisição.");
    const purchasedAt = parseOrganizationDateTime(`${purchasedOn}T12:00`, organization.timezone);
    const expiresAt = expiry ? new Date(parseOrganizationDateTime(`${expiry}T23:59`, organization.timezone).getTime() + 59999) : null;
    const reason = z.string().trim().min(5).max(2000).parse(data.get("reason"));
    const remaining = [...data.entries()].filter(([key]) => key.startsWith("remaining:")).map(([key, value]) => ({ serviceId: z.uuid().parse(key.slice(10)), quantity: z.coerce.number().int().min(0).max(10000).parse(value) }));
    await registerPreviousPackage(db, organization.id, session.user.id, { registrationId, clientId, packageId, purchasedAt, expiresAt, reason, remaining, priceInCents: packageAmount(data.get("price")) });
    refresh();
    revalidatePath(`/clientes/${clientId}`);
  } catch (error) { return failure(error); }
}
