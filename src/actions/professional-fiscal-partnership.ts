"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, professionalFiscalPartnerships, professionalFiscalShares, professionals, services } from "@/db/schema";
import { assertOrganizationPermission } from "@/lib/permissions";
import { partnershipContractSchema } from "@/lib/partnership-compliance";
import { parseHundredths } from "@/lib/professional-fiscal-share";
import { requireOrganization } from "@/lib/session";

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const page = "/equipe/parceria-fiscal";

export async function saveFiscalPartnership(form: FormData) {
  const { organization, session } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.manage");
  const professionalId = field(form, "professionalId");
  if (!z.string().uuid().safeParse(professionalId).success) return { error: "Selecione um profissional." };
  const [professional] = await db.select({ id: professionals.id }).from(professionals).where(and(
    eq(professionals.id, professionalId), eq(professionals.organizationId, organization.id),
  )).limit(1);
  if (!professional) return { error: "Profissional não encontrado nesta empresa." };

  if(form.get("active")!=="on") {
    await db.transaction(async tx => {
      await tx.update(professionalFiscalPartnerships).set({isActive:false,updatedAt:new Date()}).where(and(eq(professionalFiscalPartnerships.professionalId,professionalId),eq(professionalFiscalPartnerships.organizationId,organization.id)));
      await tx.insert(auditLogs).values({organizationId:organization.id,userId:session.user.id,entityType:"fiscal_partnership",entityId:professionalId,action:"deactivate"});
    });
    revalidatePath(page); revalidatePath("/equipe"); return;
  }
  const cpf = field(form, "cpf").replace(/[.\s-]/g, "");
  const cnpj = field(form, "cnpj").replace(/[./\s-]/g, "").toUpperCase();
  if (cpf && !/^\d{11}$/.test(cpf)) return { error: "Informe um CPF com 11 dígitos." };
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)) return { error: "Informe um CNPJ com 14 caracteres válidos." };
  let contract;
  if (form.get("contractSubmitted") === "1") {
    const fields = ["reference", "startsOn", "endsOn", "terminatedOn", "homologatedOn", "authority", "protocol", "documentUrl", "paymentTerms", "taxTerms"];
    const flags = ["eligible", "witnesses", "clausesConfirmed", "fiscalRegularity", "responsibilityAccepted"];
    const parsed = partnershipContractSchema.safeParse(Object.fromEntries([...fields.map(key => [key, field(form,key)]), ...flags.map(key => [key,form.get(key)==="on"])]));
    if (!parsed.success) return {error:parsed.error.issues[0]?.message ?? "Revise os dados do contrato."};
    contract = parsed.data;
  }
  const values = { cpf: cpf || null, cnpj, isActive: true, ...(contract ? {contract} : {}), updatedAt: new Date() };
  await db.transaction(async tx => {
    const [before] = await tx.select().from(professionalFiscalPartnerships).where(and(eq(professionalFiscalPartnerships.professionalId,professionalId),eq(professionalFiscalPartnerships.organizationId,organization.id))).for("update");
    await tx.insert(professionalFiscalPartnerships).values({ ...values, professionalId, organizationId: organization.id })
      .onConflictDoUpdate({ target: professionalFiscalPartnerships.professionalId, set: values,
        setWhere: eq(professionalFiscalPartnerships.organizationId, organization.id) });
    await tx.insert(auditLogs).values({organizationId:organization.id,userId:session.user.id,entityType:"fiscal_partnership",entityId:professionalId,action:"update",details:{before:before??null,after:values}});
  });
  revalidatePath(page); revalidatePath("/equipe");
}

export async function saveFiscalServiceShare(form: FormData) {
  const { organization, session } = await requireOrganization();
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
  await db.transaction(async tx => {
  await tx.insert(professionalFiscalShares).values({ professionalId, serviceId, percentageBasisPoints })
    .onConflictDoUpdate({ target: [professionalFiscalShares.professionalId, professionalFiscalShares.serviceId],
      set: { percentageBasisPoints } });
  await tx.insert(auditLogs).values({organizationId:organization.id,userId:session.user.id,entityType:"fiscal_share",entityId:professionalId,action:"update",details:{serviceId,percentageBasisPoints}});
  });
  revalidatePath(page); revalidatePath("/equipe");
}
