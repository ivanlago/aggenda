"use server";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { appointments, rooms } from "@/db/schema";
import { requireOrganization, requireProfessionalScope } from "@/lib/session";
import { assertOrganizationPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { withAppointmentLock } from "@/lib/appointment-safety";
import { roomBookingError } from "@/lib/room-errors";

export async function saveRoom(form: FormData) {
 const { session, organization } = await requireOrganization();
 assertOrganizationPermission(organization.role, "organization.settings.manage");
 const input = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(80), description: z.string().trim().max(500), isActive: z.boolean() }).safeParse({ id: form.get("id") || undefined, name: form.get("name"), description: form.get("description") || "", isActive: form.get("isActive") === "on" });
 if (!input.success) return { error: "Informe o nome da sala (até 80 caracteres) e uma descrição de até 500 caracteres." };
 const data = input.data;
 const result = await db.transaction(async tx => {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'rooms:' + organization.id}, 0))`);
  if (data.id) {
   const [current] = await tx.select().from(rooms).where(and(eq(rooms.id, data.id), eq(rooms.organizationId, organization.id))).limit(1);
   if (!current) return { error: "Sala não encontrada." };
   if (!data.isActive) {
    const [reserved] = await tx.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.organizationId, organization.id), eq(appointments.roomId, data.id), inArray(appointments.status, ["scheduled", "confirmed"]), gt(appointments.endsAt, new Date()))).limit(1);
    if (reserved) return { error: "Esta sala possui agendamentos futuros. Transfira-os para outra sala antes de desativar." };
   }
   await tx.update(rooms).set({ name: data.name, description: data.description || null, isActive: data.isActive, updatedAt: new Date() }).where(and(eq(rooms.id, data.id), eq(rooms.organizationId, organization.id)));
   return { id: data.id };
  }
  const [created] = await tx.insert(rooms).values({ organizationId: organization.id, name: data.name, description: data.description || null, isActive: data.isActive }).returning({ id: rooms.id });
  return created;
 }).catch(error => { if (error?.cause?.code === "23505" || error?.code === "23505") return { error: "Já existe uma sala com esse nome." }; throw error; });
 if ("error" in result) return result;
 await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: data.id ? "update" : "create", entityType: "room", entityId: result.id, details: { name: data.name, isActive: data.isActive } });
 revalidatePath("/configuracoes"); revalidatePath("/agenda");
}

export async function assignAppointmentRoom(form: FormData) {
 const { session, organization } = await requireOrganization();
 assertOrganizationPermission(organization.role, "appointments.manage");
 const parsed = z.object({ id: z.string().uuid(), roomId: z.string().uuid().nullable() }).safeParse({ id: form.get("id"), roomId: form.get("roomId") || null });
 if (!parsed.success) return { error: "Selecione uma sala válida." };
 const scope = organization.role === "professional" ? await requireProfessionalScope(organization.id, session.user.id) : null;
 const updated = await withAppointmentLock(organization.id, scope, async tx => {
  const [row] = await tx.update(appointments).set({ roomId: parsed.data.roomId, updatedAt: new Date() }).where(and(eq(appointments.id, parsed.data.id), eq(appointments.organizationId, organization.id), scope ? eq(appointments.professionalId, scope) : undefined)).returning({ id: appointments.id, roomId: appointments.roomId });
  return row;
 }).catch(error => ({ error: roomBookingError(error) || "Não foi possível reservar a sala." }));
 if (updated && "error" in updated) return updated;
 if (!updated) return { error: "Agendamento não encontrado ou fora da sua agenda." };
 await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "update:room", entityType: "appointment", entityId: updated.id, details: { roomId: updated.roomId } });
 revalidatePath("/agenda"); revalidatePath("/agendamentos"); revalidatePath(`/atendimento/${updated.id}`);
}
