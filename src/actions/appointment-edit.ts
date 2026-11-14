"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { appointments, professionals, rooms, services } from "@/db/schema";
import { requireAttendance } from "@/lib/attendance";
import { assertOrganizationPermission } from "@/lib/permissions";
import { withAppointmentLock, organizationDate } from "@/lib/appointment-safety";
import { isTimeAvailable } from "@/lib/availability";
import { updateAppointmentAndInventory } from "@/lib/inventory";
import { writeAuditLog } from "@/lib/audit";
import { syncAppointmentFinancialEntry } from "@/lib/finance";
import { enqueueAppointmentNotification } from "@/lib/whatsapp-notifications";
import { deleteAppointmentFromGoogleCalendar, syncAppointmentToGoogleCalendar } from "@/lib/google-calendar";

const editSchema = z.object({ id: z.uuid(), professionalId: z.uuid().nullable(), roomId: z.uuid().nullable(), startsAt: z.iso.datetime(), status: z.enum(["scheduled", "confirmed", "completed", "cancelled", "no_show"]), cancellationReason: z.string().trim().max(2000) });

export async function saveAppointmentEdit(form: FormData) {
 const parsed = editSchema.safeParse({ id: form.get("id"), professionalId: form.get("professionalId") || null, roomId: form.get("roomId") || null, startsAt: form.get("startsAt"), status: form.get("status"), cancellationReason: form.get("cancellationReason") || "" });
 if (!parsed.success) return { error: "Revise a situação, o profissional, a sala, a data e o horário." };
 const input = parsed.data;
 const { appointment, organization, session } = await requireAttendance(input.id);
 assertOrganizationPermission(organization.role, "appointments.manage", organization.teamPermissionOverrides);
 const startsAt = new Date(input.startsAt);
 const transfer = input.professionalId !== appointment.professionalId;
 const moved = startsAt.getTime() !== appointment.startsAt.getTime();
 const roomChanged = input.roomId !== appointment.roomId;
 const schedulingChanged = transfer || moved || roomChanged;
 const statusChanged = input.status !== appointment.status;
 if (transfer && !["admin", "owner"].includes(organization.role)) return { error: "Somente o administrador pode transferir o atendimento." };
 if (input.status === "cancelled" && !input.cancellationReason) return { error: "Informe o motivo do cancelamento." };
 if (schedulingChanged && (!["scheduled", "confirmed"].includes(appointment.status) || !["scheduled", "confirmed"].includes(input.status))) return { error: "Altere profissional, data ou sala somente em agendamentos ativos. Para cancelar ou concluir, mantenha esses dados." };
 if (!schedulingChanged && !statusChanged && (input.status !== "cancelled" || input.cancellationReason === appointment.cancellationReason)) return;
 let removedGoogleEvent = false;
 try {
  await withAppointmentLock(organization.id, input.professionalId, async tx => {
   if (transfer || moved) {
    if (!input.professionalId) throw new Error("Selecione um profissional para reagendar.");
    const [target] = await tx.select({ id: professionals.id }).from(professionals).where(and(eq(professionals.id, input.professionalId), eq(professionals.organizationId, organization.id), eq(professionals.isActive, true), eq(professionals.isBookable, true))).limit(1);
    if (!target || !await isTimeAvailable({ organizationId: organization.id, timezone: organization.timezone, date: organizationDate(startsAt, organization.timezone), serviceId: appointment.serviceId, professionalId: input.professionalId, startsAt, roomId: input.roomId, excludeAppointmentId: appointment.id, slotIntervalMinutes: organization.slotIntervalMinutes })) throw new Error("O profissional não está habilitado para este serviço ou não possui disponibilidade no horário selecionado.");
   }
   if (roomChanged && input.roomId) {
    const [room] = await tx.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.id, input.roomId), eq(rooms.organizationId, organization.id), eq(rooms.isActive, true))).limit(1);
    if (!room) throw new Error("Selecione uma sala ativa da clínica.");
   }
   if (transfer && appointment.googleCalendarEventId) {
    await deleteAppointmentFromGoogleCalendar(appointment.id);
    const [calendar] = await db.select({ eventId: appointments.googleCalendarEventId }).from(appointments).where(and(eq(appointments.id, appointment.id), eq(appointments.organizationId, organization.id)));
    if (calendar?.eventId) throw new Error("Não foi possível remover o evento da agenda Google anterior. Tente salvar novamente.");
    removedGoogleEvent = true;
   }
   const [current] = await tx.select().from(appointments).where(and(eq(appointments.id, appointment.id), eq(appointments.organizationId, organization.id))).limit(1).for("update");
   if (!current || current.status !== appointment.status || current.professionalId !== appointment.professionalId || current.roomId !== appointment.roomId || current.startsAt.getTime() !== appointment.startsAt.getTime() || current.endsAt.getTime() !== appointment.endsAt.getTime()) throw new Error("O agendamento foi alterado por outra operação. Reabra a edição.");
   let endsAt = current.endsAt;
   if (moved) {
    const [service] = await tx.select({ duration: services.durationMinutes }).from(services).where(and(eq(services.id, current.serviceId), eq(services.organizationId, organization.id))).limit(1);
    if (!service) throw new Error("Serviço não encontrado.");
    endsAt = new Date(startsAt.getTime() + service.duration * 60000);
   }
   if (schedulingChanged) await tx.update(appointments).set({ professionalId: input.professionalId, roomId: input.roomId, startsAt, endsAt, updatedAt: new Date() }).where(and(eq(appointments.id, current.id), eq(appointments.organizationId, organization.id)));
   if (statusChanged || input.status === "cancelled") {
    // Reuse stock/package/completion rules in this same transaction: no partial save.
    const transactionDatabase = { transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx) } as unknown as typeof db;
    const updated = await updateAppointmentAndInventory({ organizationId: organization.id, appointmentId: current.id, status: input.status, cancellationReason: input.cancellationReason || null, userId: session.user.id }, transactionDatabase);
    if (!updated) throw new Error("Agendamento não encontrado.");
   }
  });
 } catch (error) {
  if (removedGoogleEvent) await syncAppointmentToGoogleCalendar(appointment.id);
  return { error: error instanceof Error ? error.message : "Não foi possível salvar o agendamento." };
 }
 const effects = await Promise.allSettled([
  writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "edit_appointment", entityType: "appointment", entityId: appointment.id, details: { from: { professionalId: appointment.professionalId, roomId: appointment.roomId, startsAt: appointment.startsAt.toISOString(), status: appointment.status }, to: input } }),
  input.status === "cancelled" ? deleteAppointmentFromGoogleCalendar(appointment.id) : syncAppointmentToGoogleCalendar(appointment.id),
  syncAppointmentFinancialEntry(appointment.id),
  ...(statusChanged && ["cancelled", "confirmed"].includes(input.status) ? [enqueueAppointmentNotification(appointment.id, input.status === "cancelled" ? "cancellation" : "confirmation")] : moved || transfer ? [enqueueAppointmentNotification(appointment.id, "reschedule")] : []),
 ]);
 for (const result of effects) if (result.status === "rejected") console.error("[appointment-edit] Falha no processamento após salvar", result.reason);
 for (const path of ["/agenda", "/agendamentos", "/dashboard", "/financeiro/lancamentos", "/estoque", "/produtos-servicos", "/crescimento", `/atendimento/${appointment.id}`, `/clientes/${appointment.clientId}`, `/cliente/${organization.slug}`]) revalidatePath(path);
 if (effects.some(result => result.status === "rejected")) return { warning: "Agendamento salvo. Uma sincronização ficou pendente; confira as integrações." };
}
