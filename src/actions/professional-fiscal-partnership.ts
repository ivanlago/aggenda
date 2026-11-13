"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { professionalFiscalPartnerships, professionalFiscalShares, professionals, services } from "@/db/schema";
import { assertOrganizationPermission } from "@/lib/permissions";
import { parseHundredths } from "@/lib/professional-fiscal-share";
import { requireOrganization } from "@/lib/session";

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const page = "/equipe/parceria-fiscal";

export async function saveFiscalPartnership(form: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.manage");
  const professionalId = field(form, "professionalId");
  if (!z.string().uuid().safeParse(professionalId).success) return { error: "Selecione um profissional." };
  const [professional] = await db.select({ id: professionals.id }).from(professionals).where(and(
    eq(professionals.id, professionalId), eq(professionals.organizationId, organization.id),
  )).limit(1);
  if (!professional) return { error: "Profissional não encontrado nesta empresa." };

  if(form.get("active")!=="on") {
    await db.update(professionalFiscalPartnerships).set({isActive:false,updatedAt:new Date()}).where(and(eq(professionalFiscalPartnerships.professionalId,professionalId),eq(professionalFiscalPartnerships.organizationId,organization.id)));
    revalidatePath(page); revalidatePath("/equipe"); return;
  }
  const cpf = field(form, "cpf").replace(/[.\s-]/g, "");
  const cnpj = field(form, "cnpj").replace(/[./\s-]/g, "").toUpperCase();
  if (cpf && !/^\d{11}$/.test(cpf)) return { error: "Informe um CPF com 11 dígitos." };
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)) return { error: "Informe um CNPJ com 14 caracteres válidos." };
  const values = { cpf: cpf || null, cnpj, isActive: form.get("active") === "on", updatedAt: new Date() };
  await db.insert(professionalFiscalPartnerships).values({ ...values, professionalId, organizationId: organization.id })
    .onConflictDoUpdate({ target: professionalFiscalPartnerships.professionalId, set: values,
      setWhere: eq(professionalFiscalPartnerships.organizationId, organization.id) });
  revalidatePath(page); revalidatePath("/equipe");
}

export async function saveFiscalServiceShare(form: FormData) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.manage");
  const professionalId = field(form, "professionalId");
  const serviceId = field(form, "serviceId");
  if (![professionalId, serviceId].every(id => z.string().uuid().safeParse(id).success)) {
    return { error: "Selecione um profissional e um serviço." };
  }
  const [[partner], [service]] = await Promise.all([
    db.select({ id: professionalFiscalPartnerships.professionalId }).from(professionalFiscalPartnerships)
      .where(and(eq(professionalFiscalPartnerships.professionalId, professionalId), eq(professionalFiscalPartnerships.organizationId, organization.id))).limit(1),
    db.select({ id: services.id }).from(services)
      .where(and(eq(services.id, serviceId), eq(services.organizationId, organization.id))).limit(1),
  ]);
  if (!partner || !service) return { error: "Parceiro ou serviço não encontrado nesta empresa." };

  const percentageBasisPoints = parseHundredths(field(form, "percentage"));
  if (percentageBasisPoints === null || percentageBasisPoints > 10_000) return { error: "Informe um percentual entre 0 e 100%." };
  if (form.get("confirmed") !== "on") return { error: "Confirme que o percentual corresponde ao contrato." };
  await db.insert(professionalFiscalShares).values({ professionalId, serviceId, percentageBasisPoints })
    .onConflictDoUpdate({ target: [professionalFiscalShares.professionalId, professionalFiscalShares.serviceId],
      set: { percentageBasisPoints } });
  revalidatePath(page); revalidatePath("/equipe");
}
