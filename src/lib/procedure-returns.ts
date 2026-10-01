import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { appointments, attendancePackageItems, clientPackageBalances, clients, procedureReturns, retailSaleItems, retailSales, services } from "@/db/schema";
import { organizationDate } from "@/lib/appointment-safety";
import { procedureReturnState } from "@/lib/procedure-return-rules";

export async function getProcedureReturns(organizationId: string, timezone: string, clientId?: string, now = new Date(), database = db) {
  const [latest, upcoming, upcomingPackages, upcomingPurchases] = await Promise.all([
    database.selectDistinctOn([procedureReturns.clientId, procedureReturns.serviceId], { id: procedureReturns.id, appointmentId: procedureReturns.appointmentId, clientId: procedureReturns.clientId, serviceId: procedureReturns.serviceId, client: clients.name, service: services.name, performedAt: procedureReturns.performedAt, dueDate: procedureReturns.dueDate, reminderDays: procedureReturns.reminderDays, contactStatus: procedureReturns.contactStatus, contactedAt: procedureReturns.contactedAt, contactNote: procedureReturns.contactNote, isActive: services.isActive })
      .from(procedureReturns).innerJoin(appointments, eq(appointments.id, procedureReturns.appointmentId)).innerJoin(clients, eq(clients.id, procedureReturns.clientId)).innerJoin(services, eq(services.id, procedureReturns.serviceId))
      .where(and(eq(procedureReturns.organizationId, organizationId), eq(appointments.organizationId, organizationId), eq(appointments.status, "completed"), clientId ? eq(procedureReturns.clientId, clientId) : undefined))
      .orderBy(asc(procedureReturns.clientId), asc(procedureReturns.serviceId), desc(procedureReturns.performedAt), desc(procedureReturns.createdAt)),
    database.select({ clientId: appointments.clientId, serviceId: appointments.serviceId, startsAt: appointments.startsAt, metadata: appointments.metadata }).from(appointments)
      .where(and(eq(appointments.organizationId, organizationId), inArray(appointments.status, ["scheduled", "confirmed"]), gte(appointments.startsAt, now), clientId ? eq(appointments.clientId, clientId) : undefined)).orderBy(asc(appointments.startsAt)),
    database.select({ clientId: appointments.clientId, serviceId: clientPackageBalances.serviceId, startsAt: appointments.startsAt }).from(attendancePackageItems).innerJoin(appointments, eq(appointments.id, attendancePackageItems.appointmentId)).innerJoin(clientPackageBalances, eq(clientPackageBalances.id, attendancePackageItems.balanceId)).where(and(eq(attendancePackageItems.organizationId, organizationId), eq(appointments.organizationId, organizationId), eq(attendancePackageItems.status, "reserved"), inArray(appointments.status, ["scheduled", "confirmed"]), gte(appointments.startsAt, now), clientId ? eq(appointments.clientId, clientId) : undefined)),
    database.select({ clientId: appointments.clientId, serviceId: retailSaleItems.serviceId, startsAt: appointments.startsAt, variant: retailSaleItems.variantName }).from(retailSaleItems).innerJoin(retailSales, eq(retailSales.id, retailSaleItems.saleId)).innerJoin(appointments, eq(appointments.id, retailSales.attendanceId)).where(and(eq(retailSales.organizationId, organizationId), eq(retailSaleItems.organizationId, organizationId), eq(appointments.organizationId, organizationId), eq(retailSales.status, "completed"), inArray(appointments.status, ["scheduled", "confirmed"]), gte(appointments.startsAt, now), clientId ? eq(appointments.clientId, clientId) : undefined)),
  ]);
  const booked = [...upcoming.filter((item) => item.metadata?.primaryProcedureRemoved !== true), ...upcomingPackages, ...upcomingPurchases.filter((item) => item.serviceId && item.variant !== "Procedimento realizado")].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const today = organizationDate(now, timezone);
  return latest.filter((item) => item.dueDate && item.isActive).map((item) => {
    const dueDate = item.dueDate!;
    const scheduled = booked.find((next) => next.clientId === item.clientId && next.serviceId === item.serviceId && next.startsAt > item.performedAt);
    const state = procedureReturnState(dueDate, item.reminderDays, item.contactStatus, today, Boolean(scheduled));
    return { ...item, dueDate, state, nextAppointment: scheduled?.startsAt ?? null };
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.client.localeCompare(b.client));
}
