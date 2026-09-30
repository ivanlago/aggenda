"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { appointments, clientPackageBalances, financialEntries, packageUsages } from "@/db/schema";
import { requireAttendance } from "@/lib/attendance";
import { assertOrganizationPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

export async function removeAttendancePrimaryProcedure(data: FormData) {
  const { appointment, organization, session } = await requireAttendance(String(data.get("appointmentId") ?? ""));
  assertOrganizationPermission(organization.role, "appointments.manage");
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`attendance-payment:${appointment.id}`}, 0))`);
      const [current] = await tx.select().from(appointments).where(and(eq(appointments.id, appointment.id), eq(appointments.organizationId, organization.id))).for("update");
      if (!current || !["scheduled", "confirmed"].includes(current.status)) throw new Error("Reabra o atendimento antes de remover o procedimento.");
      if (current.metadata?.primaryProcedureRemoved === true) return;
      const [payment] = await tx.select().from(financialEntries).where(and(eq(financialEntries.appointmentId, current.id), eq(financialEntries.organizationId, organization.id))).for("update");
      if (payment?.status === "received") throw new Error("Este procedimento já foi pago. Regularize o pagamento antes de removê-lo.");
      const [usage] = await tx.select().from(packageUsages).where(and(eq(packageUsages.appointmentId, current.id), eq(packageUsages.organizationId, organization.id))).for("update");
      if (usage) {
        await tx.execute(sql`select id from client_packages where id = ${usage.clientPackageId} for update`);
        if (usage.status !== "reversed") await tx.update(clientPackageBalances).set({ usedQuantity: sql`greatest(${clientPackageBalances.usedQuantity} - ${usage.quantity}, 0)`, updatedAt: new Date() }).where(eq(clientPackageBalances.id, usage.balanceId));
        await tx.delete(packageUsages).where(eq(packageUsages.id, usage.id));
      }
      if (payment?.status === "pending") await tx.delete(financialEntries).where(eq(financialEntries.id, payment.id));
      await tx.update(appointments).set({ metadata: { ...current.metadata, primaryProcedureRemoved: true }, priceInCents: 0, updatedAt: new Date() }).where(eq(appointments.id, current.id));
    });
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível remover o procedimento." }; }
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "procedure:remove", entityType: "appointment", entityId: appointment.id });
  revalidatePath(`/atendimento/${appointment.id}`); revalidatePath(`/clientes/${appointment.clientId}`); revalidatePath("/pacotes"); revalidatePath("/agenda"); revalidatePath("/financeiro");
}
