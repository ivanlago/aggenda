"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { appointments, professionals } from "@/db/schema";
import { requireAttendance } from "@/lib/attendance";
import { withAppointmentLock, organizationDate } from "@/lib/appointment-safety";
import { isTimeAvailable } from "@/lib/availability";
import { writeAuditLog } from "@/lib/audit";
import { deleteAppointmentFromGoogleCalendar, syncAppointmentToGoogleCalendar } from "@/lib/google-calendar";

export async function transferAttendanceProfessional(data: FormData) {
  const { appointment, organization, session } = await requireAttendance(String(data.get("appointmentId") ?? ""));
  if (!["owner", "admin"].includes(organization.role)) return { error: "Somente o administrador pode transferir o atendimento." };
  const professionalId = String(data.get("professionalId") ?? "");
  if (!/^[a-f0-9-]{36}$/i.test(professionalId)) return { error: "Selecione um profissional válido." };
  if (appointment.professionalId === professionalId) return { error: "Este profissional já é o responsável." };
  const result = await withAppointmentLock(organization.id, professionalId, async tx => {
    const [current] = await tx.select().from(appointments).where(and(eq(appointments.id, appointment.id), eq(appointments.organizationId, organization.id))).limit(1);
    if (!current || !["scheduled", "confirmed"].includes(current.status)) return { error: "Somente atendimentos agendados ou confirmados podem ser transferidos." };
    const [target] = await tx.select({ id: professionals.id }).from(professionals).where(and(eq(professionals.id, professionalId), eq(professionals.organizationId, organization.id), eq(professionals.isActive, true), eq(professionals.isBookable, true))).limit(1);
    if (!target || !await isTimeAvailable({ organizationId: organization.id, timezone: organization.timezone, date: organizationDate(current.startsAt, organization.timezone), serviceId: current.serviceId, professionalId, startsAt: current.startsAt, excludeAppointmentId: current.id, roomId: current.roomId, slotIntervalMinutes: organization.slotIntervalMinutes })) return { error: "O profissional não está habilitado para este serviço ou não possui disponibilidade neste horário." };
    if (current.googleCalendarEventId) {
      await deleteAppointmentFromGoogleCalendar(current.id);
      const [calendar] = await db.select({ eventId: appointments.googleCalendarEventId }).from(appointments).where(and(eq(appointments.id, current.id), eq(appointments.organizationId, organization.id)));
      if (calendar?.eventId) return { error: "Não foi possível remover o evento da agenda Google anterior. Tente novamente antes de transferir." };
    }
    const [updated] = await tx.update(appointments).set({ professionalId, updatedAt: new Date() }).where(and(eq(appointments.id, current.id), eq(appointments.organizationId, organization.id), eq(appointments.status, current.status), eq(appointments.startsAt, current.startsAt), eq(appointments.endsAt, current.endsAt), current.professionalId ? eq(appointments.professionalId, current.professionalId) : isNull(appointments.professionalId))).returning({ id: appointments.id });
    if (!updated) return { error: "O atendimento foi alterado. Atualize a página e tente novamente." };
    return { id: current.id, previousProfessionalId: current.professionalId };
  });
  await syncAppointmentToGoogleCalendar(appointment.id);
  if ("error" in result) return result;
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "transfer_professional", entityType: "appointment", entityId: appointment.id, details: { from: result.previousProfessionalId, to: professionalId } });
  revalidatePath("/agenda"); revalidatePath("/agendamentos"); revalidatePath(`/atendimento/${appointment.id}`); revalidatePath(`/clientes/${appointment.clientId}`);
}
