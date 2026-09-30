"use server";

import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { appointments } from "@/db/schema";
import { requireAttendance } from "@/lib/attendance";
import { hasOrganizationPermission } from "@/lib/permissions";
import { getPosOfferings, getPosProducts } from "@/lib/pos-catalog";
import { getPosPackageBalances } from "@/lib/pos-package-balances";
import { attendancePendingItems } from "@/lib/attendance-pending-items";
import { addAttendancePackageItem } from "@/actions/attendance-package-items";
import { selectAttendancePackage } from "@/actions/attendance-pos";
import { writeAuditLog } from "@/lib/audit";

export async function addAttendanceItem(data: FormData) {
  const { appointment, organization } = await requireAttendance(String(data.get("appointmentId") ?? ""));
  const itemId = String(data.get("itemId") ?? "");
  if (data.get("source") === "package") {
    const balances = await getPosPackageBalances(organization.id, appointment.clientId);
    const balance = balances.find((item) => item.id === itemId);
    if (!balance) return { error: "Pacote indisponível." };
    data.set("balanceId", balance.id);
    data.set("clientPackageId", balance.clientPackageId);
    data.set("quantity", "1");
    return balance.serviceId === appointment.serviceId && appointment.metadata?.primaryProcedureRemoved !== true ? selectAttendancePackage(data) : addAttendancePackageItem(data);
  }
  return changePendingItem(data, false);
}

export async function removeAttendancePendingItem(data: FormData) {
  return changePendingItem(data, true);
}

async function changePendingItem(data: FormData, remove: boolean) {
  const { appointment, organization, session } = await requireAttendance(String(data.get("appointmentId") ?? ""));
  if (!(organization.role === "professional" || (["finance.manage", "sales.sell", "inventory.manage"] as const).some((permission) => hasOrganizationPermission(organization.role, permission)))) return { error: "Sem permissão para incluir ou remover itens à venda." };
  const itemId = String(data.get("itemId") ?? "");
  const requestId = z.uuid().safeParse(data.get("requestId"));
  if (!remove && !requestId.success) return { error: "Abra novamente o seletor de itens." };
  const catalog = remove ? [] : (await Promise.all([getPosOfferings(organization.id), getPosProducts(organization.id)])).flat();
  const item = catalog.find((candidate) => candidate.id === itemId);
  if (!remove && (!item || item.kind === "package" || ("unavailableReason" in item && item.unavailableReason))) return { error: "Produto/procedimento indisponível." };
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`attendance-payment:${appointment.id}`}, 0))`);
      const [current] = await tx.select().from(appointments).where(and(eq(appointments.id, appointment.id), eq(appointments.organizationId, organization.id))).for("update");
      if (!current || !["scheduled", "confirmed"].includes(current.status)) throw new Error("Reabra o atendimento para alterar seus itens.");
      const pending = attendancePendingItems(current.metadata);
      if (!remove && pending.some((entry) => entry.id === requestId.data)) return;
      if (item && item.id === `service:${current.serviceId}` && current.metadata?.primaryProcedureRemoved !== true) throw new Error("O procedimento principal já está listado no atendimento.");
      if (item && pending.filter((entry) => entry.catalogId === item.id).reduce((sum, entry) => sum + entry.quantity, 0) >= item.stock) throw new Error("Quantidade indisponível.");
      const next = remove ? pending.filter((entry) => entry.id !== itemId) : [...pending, { id: requestId.data!, catalogId: item!.id, label: item!.label, quantity: 1 }];
      await tx.update(appointments).set({ metadata: { ...current.metadata, pendingAttendanceItems: next } }).where(eq(appointments.id, current.id));
    });
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível alterar o item." }; }
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: remove ? "attendance:remove_pending_item" : "attendance:add_pending_item", entityType: "appointment", entityId: appointment.id, details: { itemId } });
  revalidatePath(`/atendimento/${appointment.id}`);
}
