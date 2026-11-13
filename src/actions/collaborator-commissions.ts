"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { collaboratorItemCommissions, organizationMembers } from "@/db/schema";
import { commissionCatalog } from "@/lib/commission-catalog";
import { parseCommissionPercentage } from "@/lib/item-commission";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";

export async function saveCollaboratorCommissions(form: FormData) {
  const {organization,session}=await requireOrganization();
  assertOrganizationPermission(organization.role,"finance.manage",organization.teamPermissionOverrides);
  const userId=String(form.get("userId")??"");
  const [member]=await db.select({id:organizationMembers.userId}).from(organizationMembers).where(and(eq(organizationMembers.organizationId,organization.id),eq(organizationMembers.userId,userId)));
  if(!member) return {error:"Membro não encontrado nesta empresa."};
  const catalog=await commissionCatalog(db,organization.id);
  const changes: {item:(typeof catalog)[number];rate:number|null;execution:number|null}[]=[];
  try {
    for(const item of catalog){
      const key=`commission:${item.type}:${item.id}`;
      if(!form.has(key)) continue;
      const raw=String(form.get(key)??"").trim();
      const exec=String(form.get(`executionCommission:${item.type}:${item.id}`)??"").trim();
      changes.push({item,rate:raw?parseCommissionPercentage(raw):null,execution:item.executionRate===null||!exec?null:parseCommissionPercentage(exec)});
    }
  } catch(error){return {error:error instanceof Error?error.message:"Percentual inválido."};}
  await db.transaction(async tx=>{
    for(const {item,rate,execution} of changes){
      const where=and(eq(collaboratorItemCommissions.organizationId,organization.id),eq(collaboratorItemCommissions.userId,userId),eq(collaboratorItemCommissions.itemType,item.type),eq(collaboratorItemCommissions.itemId,item.id));
      if(rate===null&&execution===null) await tx.delete(collaboratorItemCommissions).where(where);
      else await tx.insert(collaboratorItemCommissions).values({organizationId:organization.id,userId,itemType:item.type,itemId:item.id,percentageBasisPoints:rate,executionPercentageBasisPoints:execution}).onConflictDoUpdate({target:[collaboratorItemCommissions.organizationId,collaboratorItemCommissions.userId,collaboratorItemCommissions.itemType,collaboratorItemCommissions.itemId],set:{percentageBasisPoints:rate,executionPercentageBasisPoints:execution,updatedAt:new Date()}});
    }
  });
  await writeAuditLog({organizationId:organization.id,userId:session.user.id,action:"collaborator_commissions.updated",entityType:"user",entityId:userId,details:{items:changes.length}});
  revalidatePath("/equipe"); revalidatePath("/financeiro/comissoes");
}
