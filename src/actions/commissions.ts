"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, commissionEntries, commissionRules, retailProductVariants, retailSales, services } from "@/db/schema";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";
import { assertCommissionBeneficiary } from "@/lib/commission-beneficiaries";
import { CommissionError, beneficiaryKey, parseBeneficiary } from "@/lib/commission-beneficiary";
import { CommissionRepository } from "@/lib/commission-repository";
import { organizationDate } from "@/lib/organization-time";

const text = (data: FormData, name: string) => String(data.get(name) || "").trim();
function refreshPages() { for (const path of ["/financeiro/comissoes", "/financeiro", "/financeiro/relatorios", "/vendas/relatorios"]) revalidatePath(path); }
async function context() { const value = await requireOrganization(); assertOrganizationPermission(value.organization.role,"finance.manage"); return value; }

export async function saveCommissionRule(data: FormData) {
  const { organization, session } = await context();
  const beneficiary = parseBeneficiary(text(data,"beneficiary"));
  const sourceType = z.enum(["appointment","product","service"]).parse(text(data,"sourceType"));
  const trigger = sourceType === "appointment" ? z.enum(["completed_appointment","received"]).parse(text(data,"trigger")) : "received";
  const calculationType = z.enum(["percentage","fixed"]).parse(text(data,"calculationType"));
  const raw = Number(text(data,"value").replace(",","."));
  if (!Number.isFinite(raw) || raw < 0 || (calculationType === "percentage" && raw > 100)) return { error: "Informe um valor válido; percentual deve ficar entre 0 e 100%." };
  const value = Math.round(raw * 100);
  if (!Number.isSafeInteger(value) || value > 2147483647) return { error: "Valor acima do limite permitido." };
  const serviceId = sourceType !== "product" && text(data,"serviceId") ? z.uuid().parse(text(data,"serviceId")) : null;
  const variantId = sourceType === "product" && text(data,"variantId") ? z.uuid().parse(text(data,"variantId")) : null;
  await db.transaction(async tx => {
    await assertCommissionBeneficiary(tx,organization.id,beneficiary);
    if (serviceId && !(await tx.select({ id: services.id }).from(services).where(and(eq(services.id,serviceId),eq(services.organizationId,organization.id))).limit(1)).length) throw new Error("Procedimento não encontrado nesta clínica.");
    if (variantId && !(await tx.select({ id: retailProductVariants.id }).from(retailProductVariants).where(and(eq(retailProductVariants.id,variantId),eq(retailProductVariants.organizationId,organization.id))).limit(1)).length) throw new Error("Produto não encontrado nesta clínica.");
    const [created] = await tx.insert(commissionRules).values({ organizationId: organization.id, ...beneficiary, sourceType, serviceId, variantId, trigger, calculationType, value }).returning({ id: commissionRules.id });
    await tx.insert(auditLogs).values({ organizationId: organization.id,userId: session.user.id,action: "create",entityType: "commission_rule",entityId: created.id,details: { sourceType,trigger,calculationType,value } });
  });
  refreshPages();
}
export async function deactivateCommissionRule(data: FormData) {
  const { organization,session } = await context(); const id = z.uuid().parse(text(data,"id"));
  await db.transaction(async tx => { await tx.update(commissionRules).set({ isActive:false,updatedAt:new Date() }).where(and(eq(commissionRules.organizationId,organization.id),eq(commissionRules.id,id))); await tx.insert(auditLogs).values({ organizationId:organization.id,userId:session.user.id,action:"deactivate",entityType:"commission_rule",entityId:id }); }); refreshPages();
}
export async function calculateCommissions(data: FormData) {
  const { organization,session } = await context();
  const competence = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).parse(text(data,"competence"));
  try { await new CommissionRepository(db).refresh(organization.id,organization.timezone,session.user.id,competence); } catch(error) { if(error instanceof CommissionError) return { error: error.message }; throw error; } refreshPages();
}
export async function payCommissions(data: FormData) {
  const { organization,session } = await context();
  const paidOn = text(data,"paidOn");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || Number.isNaN(Date.parse(paidOn)) || new Date(paidOn).toISOString().slice(0,10) !== paidOn || paidOn > organizationDate(new Date(),organization.timezone)) return { error:"Informe a data válida da quitação, até hoje." };
  try { await new CommissionRepository(db).pay({ org:organization.id,timezone:organization.timezone,actor:session.user.id,expectedAmount:z.coerce.number().int().positive().parse(text(data,"expectedAmount")),beneficiary:parseBeneficiary(text(data,"beneficiary")),requestKey:z.uuid().parse(text(data,"requestKey")),paidOn,accountId:z.uuid().parse(text(data,"accountId")),method:z.enum(["pix","cash","bank_transfer","other"]).parse(text(data,"method")),notes:text(data,"notes").slice(0,2000),entryId:text(data,"entryId") ? z.uuid().parse(text(data,"entryId")) : undefined }); } catch(error) { if(error instanceof CommissionError) return { error: error.message }; throw error; } refreshPages();
}
export async function reverseCommissionPayment(data: FormData) {
  const { organization,session } = await context(); const reason=text(data,"reason");
  if (reason.length<5 || reason.length>2000) return { error:"Informe o motivo do estorno (5 a 2000 caracteres)." };
  try { await new CommissionRepository(db).reverse(organization.id,session.user.id,z.uuid().parse(text(data,"id")),reason); } catch(error) { if(error instanceof CommissionError) return { error: error.message }; throw error; } refreshPages();
}
export async function assignSaleCommissionBeneficiary(data: FormData) {
  const { organization,session } = await context(); const id=z.uuid().parse(text(data,"saleId")); const beneficiary=parseBeneficiary(text(data,"beneficiary"));
  const competence = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`commission-ledger:${organization.id}`},0))`);
    await assertCommissionBeneficiary(tx,organization.id,beneficiary);
    const [sale]=await tx.select().from(retailSales).where(and(eq(retailSales.organizationId,organization.id),eq(retailSales.id,id))).for("update");
    if (!sale || sale.status!=="completed") throw new Error("Venda não encontrada ou revertida.");
    const existing=await tx.select({id:commissionEntries.id}).from(commissionEntries).where(and(eq(commissionEntries.organizationId,organization.id),eq(commissionEntries.saleId,id))).limit(1);
    if (existing.length && beneficiaryKey({ professionalId:sale.commissionProfessionalId,beneficiaryUserId:sale.commissionUserId })!==beneficiaryKey(beneficiary)) throw new Error("A venda já possui comissões. Estorne e revise os lançamentos antes de alterar o beneficiário.");
    await tx.update(retailSales).set({commissionProfessionalId:beneficiary.professionalId,commissionUserId:beneficiary.beneficiaryUserId}).where(eq(retailSales.id,id));
    await tx.insert(auditLogs).values({organizationId:organization.id,userId:session.user.id,action:"assign",entityType:"sale_commission_beneficiary",entityId:id,details:{beneficiary:beneficiaryKey(beneficiary)}});
    return organizationDate(sale.soldAt,organization.timezone).slice(0,7);
  });
  try { await new CommissionRepository(db).refresh(organization.id,organization.timezone,session.user.id,competence); } catch(error) { if(error instanceof CommissionError) return { error: error.message }; throw error; } refreshPages();
}
