import { and, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import { appointments, equipment, servicesToEquipment } from "@/db/schema";

export async function equipmentAvailability(input: { organizationId: string; serviceId: string; startsAt: Date; endsAt: Date; excludeAppointmentId?: string }) {
  const required = await db.select({ id: equipment.id, active: equipment.isActive, concurrent: equipment.allowsConcurrent }).from(servicesToEquipment).innerJoin(equipment, and(eq(equipment.id, servicesToEquipment.equipmentId), eq(equipment.organizationId, input.organizationId))).where(and(eq(servicesToEquipment.organizationId, input.organizationId), eq(servicesToEquipment.serviceId, input.serviceId)));
  if (required.some(item => !item.active)) return { inactive: true, busy: [] };
  const exclusive = required.filter(item => !item.concurrent).map(item => item.id);
  if (!exclusive.length) return { inactive: false, busy: [] };
  const busy = await db.selectDistinct({ startsAt: appointments.startsAt, endsAt: appointments.endsAt }).from(appointments).innerJoin(servicesToEquipment, and(eq(servicesToEquipment.serviceId, appointments.serviceId), eq(servicesToEquipment.organizationId, input.organizationId))).where(and(eq(appointments.organizationId, input.organizationId), inArray(servicesToEquipment.equipmentId, exclusive), inArray(appointments.status, ["scheduled", "confirmed", "completed"]), lt(appointments.startsAt, input.endsAt), gt(appointments.endsAt, input.startsAt), input.excludeAppointmentId ? ne(appointments.id, input.excludeAppointmentId) : undefined));
  return { inactive: false, busy };
}
