"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { appointments, executionCommissionSnapshots, organizationMembers, professionals } from "@/db/schema";
import { requireAttendance } from "@/lib/attendance";
import { assertOrganizationPermission } from "@/lib/permissions";
import { parseCommissionPercentage } from "@/lib/item-commission";
import { writeAuditLog } from "@/lib/audit";

export async function saveAttendanceCommissionSplit(form: FormData) {
  const {organization,session,appointment}=await requireAttendance(String(form.get("appointmentId")??""));
  assertOrganizationPermission(organization.role,"appointments.manage",organization.teamPermissionOverrides);
  const divided=form.get("divideExecutionCommission")==="on";
  const assistantId=divided?String(form.get("commissionAssistantId")??""):null;
  let share=0;
  try{share=divided?parseCommissionPercentage(form.get("assistantParticipation")):0;}catch(error){return {error:error instanceof Error?error.message:"Participação inválida."};}
  if(divided&&(!assistantId||share<1))return {error:"Selecione um assistente e uma participação maior que zero."};
  await db.transaction(async tx=>{
    const [current]=await tx.select().from(appointments).where(and(eq(appointments.id,appointment.id),eq(appointments.organizationId,organization.id))).for("update");
    if(!current||current.status==="completed")throw new Error("Configure a divisão antes de concluir o atendimento.");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`commission-ledger:${organization.id}`},0))`);
    const [frozen]=await tx.select({id:executionCommissionSnapshots.id}).from(executionCommissionSnapshots).where(and(eq(executionCommissionSnapshots.organizationId,organization.id),eq(executionCommissionSnapshots.appointmentId,current.id))).limit(1);
    if(frozen)throw new Error("A comissão deste atendimento já foi registrada. Sua divisão foi preservada no histórico.");
    if(assistantId){
      const [assistant]=await tx.select({id:professionals.id}).from(professionals).innerJoin(organizationMembers,and(eq(organizationMembers.organizationId,organization.id),eq(organizationMembers.userId,professionals.userId))).where(and(eq(professionals.id,assistantId),eq(professionals.organizationId,organization.id),eq(professionals.isActive,true),eq(professionals.isBookable,true)));
      if(!assistant||assistant.id===current.professionalId)throw new Error("Escolha outro profissional ativo da equipe para auxiliar o executor.");
    }
    await tx.update(appointments).set({commissionAssistantId:assistantId,commissionAssistantShareBasisPoints:share,updatedAt:new Date()}).where(eq(appointments.id,current.id));
  });
  await writeAuditLog({organizationId:organization.id,userId:session.user.id,action:"execution_commission.split",entityType:"appointment",entityId:appointment.id,details:{assistantId,assistantShareBasisPoints:share}});
  revalidatePath(`/atendimento/${appointment.id}`);revalidatePath("/financeiro/comissoes");
}
