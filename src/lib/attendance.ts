import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments } from "@/db/schema";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization, requireProfessionalScope } from "@/lib/session";

export async function requireAttendance(id: string) {
  const context = await requireOrganization();
  assertOrganizationPermission(context.organization.role, "appointments.read");
  const professionalId = context.organization.role === "professional"
    ? await requireProfessionalScope(context.organization.id, context.session.user.id) : null;
  const [appointment] = await db.select().from(appointments).where(and(
    eq(appointments.id, id), eq(appointments.organizationId, context.organization.id),
    professionalId ? eq(appointments.professionalId, professionalId) : undefined,
  )).limit(1);
  if (!appointment) throw new Error("Atendimento não encontrado ou sem acesso.");
  return { ...context, appointment };
}
