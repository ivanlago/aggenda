"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { procedureReturns } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";
import { getProcedureReturns } from "@/lib/procedure-returns";

export async function updateProcedureReturnContact(data: FormData) {
  const { organization, session } = await requireOrganization();
  assertOrganizationPermission(organization.role, "crm.manage");
  const id = String(data.get("id") ?? "");
  const status = String(data.get("contactStatus") ?? "");
  const note = String(data.get("contactNote") ?? "").trim();
  if (!["pending", "contacted", "dismissed"].includes(status) || note.length > 2000) return { error: "Revise a situação e a observação (até 2.000 caracteres)." };
  const rows = await getProcedureReturns(organization.id, organization.timezone);
  const row = rows.find((item) => item.id === id);
  if (!row) return { error: "Retorno não encontrado ou substituído por um atendimento mais recente." };
  if (row.nextAppointment && status === "contacted") return { error: "O cliente já possui um novo agendamento deste procedimento." };
  await db.transaction(async (tx) => {
    await tx.execute(sql`select id from procedure_returns where id = ${id} and organization_id = ${organization.id} for update`);
    await tx.update(procedureReturns).set({ contactStatus: status, contactedAt: status === "contacted" ? new Date() : null, contactNote: note || null }).where(and(eq(procedureReturns.id, id), eq(procedureReturns.organizationId, organization.id)));
  });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: `return:${status}`, entityType: "procedure_return", entityId: id, details: { note } });
  revalidatePath("/crescimento");
  revalidatePath(`/cliente/${organization.slug}`);
}
