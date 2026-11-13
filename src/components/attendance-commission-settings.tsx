import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { executionCommissionSnapshots, organizationMembers, professionals } from "@/db/schema";
import { requireAttendance } from "@/lib/attendance";
import { hasOrganizationPermission } from "@/lib/permissions";
import { AttendanceCommissionSplitForm } from "./attendance-commission-split-form";

export async function AttendanceCommissionSettings({appointmentId}:{appointmentId:string}){
  const {organization,appointment}=await requireAttendance(appointmentId);
  const [people,snapshots,quote]=await Promise.all([
    db.select({id:professionals.id,name:professionals.name}).from(professionals).innerJoin(organizationMembers,and(eq(organizationMembers.organizationId,organization.id),eq(organizationMembers.userId,professionals.userId))).where(and(eq(professionals.organizationId,organization.id),eq(professionals.isActive,true),eq(professionals.isBookable,true))).orderBy(professionals.name),
    db.select({total:executionCommissionSnapshots.totalInCents}).from(executionCommissionSnapshots).where(and(eq(executionCommissionSnapshots.appointmentId,appointmentId),eq(executionCommissionSnapshots.organizationId,organization.id))),
    db.execute<{base_in_cents:number;rate_basis_points:number}>(sql`select base_in_cents,rate_basis_points from aggenda_execution_sources(${appointment.id}::uuid)`),
  ]);
  const amounts=snapshots.length?snapshots.map(row=>row.total):quote.rows.map(row=>Math.round(row.base_in_cents*row.rate_basis_points/10000));
  return <section className="panel mt-4"><h2 className="mb-3 text-lg font-extrabold">Comissão de execução</h2><AttendanceCommissionSplitForm appointmentId={appointment.id} choices={people.filter(p=>p.id!==appointment.professionalId)} assistantId={appointment.commissionAssistantId} share={appointment.commissionAssistantShareBasisPoints} amounts={amounts} locked={snapshots.length>0||appointment.status==="completed"} canManage={Boolean(appointment.professionalId)&&hasOrganizationPermission(organization.role,"appointments.manage",organization.teamPermissionOverrides)}/></section>;
}
