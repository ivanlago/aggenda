import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  appointments,
  clientPackages,
  clients,
  financialEntries,
  organizations,
  servicePackages,
  services,
} from "@/db/schema";
import { organizationDate } from "@/lib/appointment-safety";

export async function syncAppointmentFinancialEntry(appointmentId: string) {
  const [sale] = await db.select({
    appointmentId: appointments.id,
    organizationId: appointments.organizationId,
    clientId: appointments.clientId,
    clientName: clients.name,
    serviceName: services.name,
    amountInCents: appointments.priceInCents,
    startsAt: appointments.startsAt,
    appointmentStatus: appointments.status,
    timezone: organizations.timezone,
  }).from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(organizations, eq(organizations.id, appointments.organizationId))
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  if (!sale) return;

  const [existing] = await db.select({
    id: financialEntries.id,
    status: financialEntries.status,
  }).from(financialEntries)
    .where(eq(financialEntries.appointmentId, appointmentId))
    .limit(1);
  if (!sale.amountInCents || sale.amountInCents <= 0) {
    if (existing?.status === "pending") {
      await db.delete(financialEntries).where(eq(financialEntries.id, existing.id));
    }
    return;
  }
  const status = existing?.status === "received"
    ? "received"
    : sale.appointmentStatus === "cancelled"
      ? "cancelled"
      : "pending";
  const values = {
    organizationId: sale.organizationId,
    clientId: sale.clientId,
    appointmentId,
    type: "receivable",
    source: "appointment",
    status,
    description: `${sale.serviceName} - ${sale.clientName}`,
    category: "Atendimentos",
    amountInCents: sale.amountInCents,
    dueDate: organizationDate(sale.startsAt, sale.timezone),
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(financialEntries).set(values).where(eq(financialEntries.id, existing.id));
  } else {
    await db.insert(financialEntries).values(values);
  }
}

export async function createClientPackageFinancialEntry({
  clientPackageId,
  dueDate,
  received,
  paymentMethod,
}: {
  clientPackageId: string;
  dueDate: string;
  received: boolean;
  paymentMethod: string | null;
}) {
  const [sale] = await db.select({
    organizationId: clientPackages.organizationId,
    clientId: clientPackages.clientId,
    clientName: clients.name,
    packageName: servicePackages.name,
    amountInCents: clientPackages.priceInCents,
  }).from(clientPackages)
    .innerJoin(clients, eq(clients.id, clientPackages.clientId))
    .innerJoin(servicePackages, eq(servicePackages.id, clientPackages.packageId))
    .where(eq(clientPackages.id, clientPackageId))
    .limit(1);
  if (!sale || sale.amountInCents <= 0) return;
  await db.insert(financialEntries).values({
    organizationId: sale.organizationId,
    clientId: sale.clientId,
    clientPackageId,
    type: "receivable",
    source: "package",
    status: received ? "received" : "pending",
    description: `${sale.packageName} - ${sale.clientName}`,
    category: "Pacotes",
    amountInCents: sale.amountInCents,
    dueDate,
    realizedDate: received ? dueDate : null,
    paymentMethod,
  });
}
