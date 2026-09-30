"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { appointments, attendancePackageItems, clientPackageBalances, clientPackages } from "@/db/schema";
import { requireAttendance } from "@/lib/attendance";
import { assertOrganizationPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";

export async function addAttendancePackageItem(data: FormData) {
  const { appointment, organization, session } = await requireAttendance(String(data.get("appointmentId") ?? ""));
  assertOrganizationPermission(organization.role, "appointments.manage");
  const parsed = z.object({ balanceId: z.uuid(), quantity: z.coerce.number().int().min(1).max(10000) }).safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: "Selecione o procedimento e uma quantidade válida." };
  try {
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(appointments).where(and(eq(appointments.id, appointment.id), eq(appointments.organizationId, organization.id))).for("update");
      if (!current || !["scheduled", "confirmed"].includes(current.status)) throw new Error("Adicione os procedimentos antes de concluir o atendimento.");
      const [balance] = await tx.select({ id: clientPackageBalances.id, serviceId: clientPackageBalances.serviceId, packageId: clientPackages.id, expiresAt: clientPackages.expiresAt, status: clientPackages.status }).from(clientPackageBalances).innerJoin(clientPackages, eq(clientPackages.id, clientPackageBalances.clientPackageId)).where(and(eq(clientPackageBalances.id, parsed.data.balanceId), eq(clientPackageBalances.organizationId, organization.id), eq(clientPackages.organizationId, organization.id), eq(clientPackages.clientId, current.clientId))).for("update", { of: clientPackages });
      if (!balance || balance.status !== "active" || (balance.expiresAt && balance.expiresAt <= new Date())) throw new Error("Pacote indisponível ou vencido.");
      if (balance.serviceId === current.serviceId && current.metadata?.primaryProcedureRemoved !== true) throw new Error("Use a opção do procedimento principal para vincular seu pacote.");
      const [existing] = await tx.select({ id: attendancePackageItems.id }).from(attendancePackageItems).where(and(eq(attendancePackageItems.appointmentId, current.id), eq(attendancePackageItems.balanceId, balance.id)));
      if (existing) throw new Error("Este item já foi selecionado. Remova-o antes de alterar a quantidade.");
      const [updated] = await tx.update(clientPackageBalances).set({ usedQuantity: sql`${clientPackageBalances.usedQuantity} + ${parsed.data.quantity}`, updatedAt: new Date() }).where(and(eq(clientPackageBalances.id, balance.id), sql`${clientPackageBalances.usedQuantity} + ${parsed.data.quantity} <= ${clientPackageBalances.totalQuantity}`)).returning({ id: clientPackageBalances.id });
      if (!updated) throw new Error("Saldo insuficiente para a quantidade selecionada.");
      await tx.insert(attendancePackageItems).values({ organizationId: organization.id, appointmentId: current.id, clientPackageId: balance.packageId, balanceId: balance.id, quantity: parsed.data.quantity });
    });
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível selecionar o procedimento." }; }
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "package:reserve_item", entityType: "appointment", entityId: appointment.id, details: parsed.data });
  revalidatePath(`/atendimento/${appointment.id}`); revalidatePath(`/clientes/${appointment.clientId}`); revalidatePath("/pacotes");
}

export async function removeAttendancePackageItem(data: FormData) {
  const { appointment, organization, session } = await requireAttendance(String(data.get("appointmentId") ?? ""));
  assertOrganizationPermission(organization.role, "appointments.manage");
  const itemId = z.uuid().safeParse(data.get("itemId"));
  if (!itemId.success) return { error: "Item inválido." };
  try {
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(appointments).where(and(eq(appointments.id, appointment.id), eq(appointments.organizationId, organization.id))).for("update");
      if (!current || !["scheduled", "confirmed"].includes(current.status)) throw new Error("Reabra o atendimento antes de remover procedimentos.");
      const [item] = await tx.select().from(attendancePackageItems).where(and(eq(attendancePackageItems.id, itemId.data), eq(attendancePackageItems.appointmentId, current.id), eq(attendancePackageItems.organizationId, organization.id))).for("update");
      if (!item) return;
      if (item.status !== "reserved") throw new Error("Este item não está reservado.");
      await tx.execute(sql`select id from client_packages where id = ${item.clientPackageId} for update`);
      await tx.update(clientPackageBalances).set({ usedQuantity: sql`greatest(${clientPackageBalances.usedQuantity} - ${item.quantity}, 0)`, updatedAt: new Date() }).where(eq(clientPackageBalances.id, item.balanceId));
      await tx.delete(attendancePackageItems).where(eq(attendancePackageItems.id, item.id));
    });
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível remover o procedimento." }; }
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "package:remove_item", entityType: "appointment", entityId: appointment.id, details: { itemId: itemId.data } });
  revalidatePath(`/atendimento/${appointment.id}`); revalidatePath(`/clientes/${appointment.clientId}`); revalidatePath("/pacotes");
}
