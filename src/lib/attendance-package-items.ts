import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { attendancePackageItems, clientPackageBalances } from "@/db/schema";

export function packageItemTarget(status: string) {
  return status === "completed" ? "consumed" : status === "cancelled" || status === "no_show" ? "reversed" : "reserved";
}

export async function reconcileAttendancePackageItems(appointmentId: string, status: string, executor: typeof db) {
  const items = await executor.select().from(attendancePackageItems).where(eq(attendancePackageItems.appointmentId, appointmentId)).orderBy(attendancePackageItems.clientPackageId).for("update");
  const target = packageItemTarget(status);
  for (const item of items) {
    if (item.status === target) continue;
    await executor.execute(sql`select id from client_packages where id = ${item.clientPackageId} for update`);
    if (target === "reversed" && item.status !== "reversed") {
      await executor.update(clientPackageBalances).set({ usedQuantity: sql`greatest(${clientPackageBalances.usedQuantity} - ${item.quantity}, 0)`, updatedAt: new Date() }).where(eq(clientPackageBalances.id, item.balanceId));
    } else if (target !== "reversed" && item.status === "reversed") {
      const [updated] = await executor.update(clientPackageBalances).set({ usedQuantity: sql`${clientPackageBalances.usedQuantity} + ${item.quantity}`, updatedAt: new Date() }).where(and(eq(clientPackageBalances.id, item.balanceId), sql`${clientPackageBalances.usedQuantity} + ${item.quantity} <= ${clientPackageBalances.totalQuantity}`)).returning({ id: clientPackageBalances.id });
      if (!updated) throw new Error("Saldo insuficiente no pacote para reabrir este atendimento.");
    }
    await executor.update(attendancePackageItems).set({ status: target }).where(eq(attendancePackageItems.id, item.id));
  }
}
