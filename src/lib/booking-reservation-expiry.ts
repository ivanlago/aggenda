import { and, eq, inArray, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { appointments, financialEntries, auditLogs } from "@/db/schema";
import { deleteAppointmentFromGoogleCalendar } from "@/lib/google-calendar";

/** Scoped read-path recovery plus authenticated cron. Payment/report races recheck under row lock. */
export async function expireBookingReservations(scope?: { organizationId?: string; token?: string }) {
  const now = new Date();
  const condition = and(inArray(appointments.status,["scheduled","confirmed"]),inArray(appointments.depositStatus,["pending","direct_pending"]),lte(appointments.reservationExpiresAt,now),scope?.organizationId?eq(appointments.organizationId,scope.organizationId):undefined,scope?.token?eq(appointments.publicManageToken,scope.token):undefined);
  const candidates = await db.select({id:appointments.id}).from(appointments).where(condition).limit(100);
  if (!candidates.length) return 0;
  const expired = await db.transaction(async tx => {
    // Do not wait on reservations already being paid/reported/changed in another transaction.
    const locked = await tx.select({id:appointments.id}).from(appointments).where(and(condition,inArray(appointments.id,candidates.map(row=>row.id)))).for("update",{skipLocked:true});
    if (!locked.length) return [];
    const rows = await tx.update(appointments).set({status:"cancelled",depositStatus:"expired",cancellationReason:"Reserva expirada sem pagamento do sinal",updatedAt:now}).where(and(condition,inArray(appointments.id,locked.map(row=>row.id)))).returning({id:appointments.id,organizationId:appointments.organizationId});
    for (const row of rows) {
      await tx.update(financialEntries).set({status:"cancelled",updatedAt:now}).where(and(eq(financialEntries.organizationId,row.organizationId),eq(financialEntries.type,"receivable"),eq(financialEntries.status,"pending"),or(eq(financialEntries.appointmentId,row.id),and(eq(financialEntries.attendanceId,row.id),inArray(financialEntries.source,["appointment_deposit","appointment_deposit_direct"])))));
      await tx.insert(auditLogs).values({organizationId:row.organizationId,entityType:"appointment",entityId:row.id,action:"reservation_expired",details:{reason:"Sinal não confirmado dentro do prazo"}});
    }
    return rows;
  });
  await Promise.all(expired.map(async row=>{try{await deleteAppointmentFromGoogleCalendar(row.id);}catch{console.error("[booking-expiry] Falha ao remover evento da reserva expirada",row.id);}}));
  return expired.length;
}
