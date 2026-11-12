"use server";

import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { appointments, auditLogs, equipment, services, servicesToEquipment } from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { assertOrganizationPermission } from "@/lib/permissions";

export async function saveEquipment(form: FormData) {
  const { session, organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "organization.settings.manage");
  const parsed = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(100), sortOrder: z.coerce.number().int().min(0).max(99999), allowsConcurrent: z.boolean(), isActive: z.boolean(), serviceIds: z.array(z.string().uuid()).max(1000) }).safeParse({ id: form.get("id") || undefined, name: form.get("name"), sortOrder: form.get("sortOrder") || 0, allowsConcurrent: form.get("allowsConcurrent") === "true", isActive: form.get("isActive") === "true", serviceIds: [...new Set(form.getAll("serviceIds"))] });
  if (!parsed.success) return { error: "Informe nome, ordem e serviços válidos para o equipamento." };
  const { id, serviceIds, ...data } = parsed.data;
  try {
    const result = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'equipment:' + organization.id}, 0))`);
      const [current] = id ? await tx.select().from(equipment).where(and(eq(equipment.id, id), eq(equipment.organizationId, organization.id))) : [];
      if (id && !current) return { error: "Equipamento não encontrado." };
      const linked = id ? await tx.select({ serviceId: servicesToEquipment.serviceId }).from(servicesToEquipment).where(and(eq(servicesToEquipment.equipmentId, id), eq(servicesToEquipment.organizationId, organization.id))) : [];
      if (serviceIds.length) {
        const valid = await tx.select({ id: services.id }).from(services).where(and(eq(services.organizationId, organization.id), inArray(services.id, serviceIds)));
        if (valid.length !== serviceIds.length) return { error: "Selecione apenas serviços desta empresa." };
      }
      const allServices = [...new Set([...serviceIds, ...linked.map(item => item.serviceId)])];
      const future = allServices.length ? await tx.select({ id: appointments.id, serviceId: appointments.serviceId, startsAt: appointments.startsAt, endsAt: appointments.endsAt }).from(appointments).where(and(eq(appointments.organizationId, organization.id), inArray(appointments.serviceId, allServices), inArray(appointments.status, ["scheduled", "confirmed"]), gt(appointments.endsAt, new Date()))) : [];
      if (current?.isActive && !data.isActive && future.some(item => linked.some(link => link.serviceId === item.serviceId))) return { error: "Este equipamento é necessário em agendamentos futuros. Reagende-os ou revise os vínculos antes de desativar." };
      if (data.isActive && !data.allowsConcurrent) {
        const using = future.filter(item => serviceIds.includes(item.serviceId!)).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
        if (using.some((item, index) => using.slice(0, index).some(other => item.startsAt < other.endsAt && item.endsAt > other.startsAt))) return { error: "Existem agendamentos sobrepostos para os serviços selecionados. Ajuste a agenda antes de exigir este equipamento exclusivo." };
      }
      const equipmentId = id ?? (await tx.insert(equipment).values({ ...data, organizationId: organization.id }).returning({ id: equipment.id }))[0].id;
      if (id) await tx.update(equipment).set({ ...data, updatedAt: new Date() }).where(and(eq(equipment.id, id), eq(equipment.organizationId, organization.id)));
      await tx.delete(servicesToEquipment).where(and(eq(servicesToEquipment.equipmentId, equipmentId), eq(servicesToEquipment.organizationId, organization.id)));
      if (serviceIds.length) await tx.insert(servicesToEquipment).values(serviceIds.map(serviceId => ({ organizationId: organization.id, serviceId, equipmentId })));
      await tx.insert(auditLogs).values({ organizationId: organization.id, userId: session.user.id, action: id ? "update" : "create", entityType: "equipment", entityId: equipmentId, details: { ...data, serviceIds } });
      return { id: equipmentId };
    });
    if ("error" in result) return result;
    revalidatePath("/configuracoes"); revalidatePath("/agenda"); revalidatePath("/produtos-servicos");
  } catch (error) {
    const cause = error as { code?: string; cause?: { code?: string } };
    if (cause.code === "23505" || cause.cause?.code === "23505") return { error: "Já existe um equipamento com esse nome." };
    throw error;
  }
}
