import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { appointments, attendancePackageItems, clientPackageBalances, procedureReturns, retailSaleItems, retailSales, services } from "@/db/schema";
import { organizationDate } from "@/lib/appointment-safety";
import { returnDate } from "@/lib/procedure-return-rules";
import { AttendanceReturnOptions } from "./attendance-return-options";

export async function AttendanceReturnSettings({ appointment, timezone }: { appointment: typeof appointments.$inferSelect; timezone: string }) {
  const [packages, purchases, saved] = await Promise.all([
    db.select({ serviceId: clientPackageBalances.serviceId }).from(attendancePackageItems).innerJoin(clientPackageBalances, eq(clientPackageBalances.id, attendancePackageItems.balanceId)).where(and(eq(attendancePackageItems.organizationId, appointment.organizationId), eq(attendancePackageItems.appointmentId, appointment.id), inArray(attendancePackageItems.status, ["reserved", "consumed"]))),
    db.select({ serviceId: retailSaleItems.serviceId, variant: retailSaleItems.variantName }).from(retailSaleItems).innerJoin(retailSales, eq(retailSales.id, retailSaleItems.saleId)).where(and(eq(retailSales.organizationId, appointment.organizationId), eq(retailSales.attendanceId, appointment.id), eq(retailSales.status, "completed"))),
    db.select().from(procedureReturns).where(and(eq(procedureReturns.organizationId, appointment.organizationId), eq(procedureReturns.appointmentId, appointment.id))),
  ]);
  const ids = [...new Set([...(appointment.metadata?.primaryProcedureRemoved === true ? [] : [appointment.serviceId]), ...packages.map((item) => item.serviceId), ...purchases.flatMap((item) => item.serviceId && item.variant !== "Procedimento realizado" ? [item.serviceId] : [])])];
  if (!ids.length) return null;
  const catalog = await db.select().from(services).where(and(eq(services.organizationId, appointment.organizationId), inArray(services.id, ids))).orderBy(services.name);
  return <AttendanceReturnOptions procedures={catalog.map((service) => {
    const snapshot = saved.find((item) => item.serviceId === service.id);
    return { id: service.id, name: service.name, dueDate: snapshot ? snapshot.dueDate : returnDate(organizationDate(appointment.startsAt, timezone), service.returnInterval, service.returnIntervalUnit) };
  })} />;
}
