"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { financialEntries, packageUsages } from "@/db/schema";
import { requireAttendance } from "@/lib/attendance";
import { assertOrganizationPermission } from "@/lib/permissions";
import { organizationDate } from "@/lib/appointment-safety";
import { writeAuditLog } from "@/lib/audit";
import { registerAppointmentPayment } from "@/actions/app";
import { attendancePaymentState } from "@/lib/attendance-payment";

export async function payAttendance(data: FormData) {
  const { appointment, organization } = await requireAttendance(String(data.get("appointmentId") ?? ""));
  assertOrganizationPermission(organization.role, "finance.manage");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`attendance-payment:${appointment.id}`}, 0))`);
    const [entry] = await tx.select({ status: financialEntries.status }).from(financialEntries).where(and(eq(financialEntries.organizationId, organization.id), eq(financialEntries.appointmentId, appointment.id))).limit(1);
    const [usage] = await tx.select({ id: packageUsages.appointmentId }).from(packageUsages).where(and(eq(packageUsages.organizationId, organization.id), eq(packageUsages.appointmentId, appointment.id), inArray(packageUsages.status, ["reserved", "consumed"]))).limit(1);
    const state = attendancePaymentState({ paymentStatus: entry?.status, packageStatus: usage ? "reserved" : null, appointmentStatus: appointment.status });
    if (state === "paid" || state === "package") return { error: "Este procedimento já está pago ou coberto por pacote. Atualize a página." };
    if (state === "blocked") return { error: "Revise a situação do agendamento antes de receber o procedimento." };
    await registerAppointmentPayment(data);
    revalidatePath(`/atendimento/${appointment.id}`);
    revalidatePath("/agenda");
  });
}

export async function payAttendanceExtra(data: FormData) {
  const { appointment, organization, session } = await requireAttendance(String(data.get("appointmentId") ?? ""));
  assertOrganizationPermission(organization.role, "finance.manage");
  const parsed = z.object({
    id: z.uuid(), description: z.string().trim().min(2).max(300),
    amount: z.string().regex(/^\d+(?:[.,]\d{1,2})?$/).transform((value) => Math.round(Number(value.replace(",", ".")) * 100)).pipe(z.number().int().min(1).max(100000000)),
    paymentMethod: z.enum(["cash", "pix", "credit_card", "debit_card", "bank_transfer"]),
  }).safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: "Revise a descrição, o valor e a forma de pagamento." };
  const { id, description, amount, paymentMethod } = parsed.data;
  const today = organizationDate(new Date(), organization.timezone);
  const [created] = await db.insert(financialEntries).values({ id, organizationId: organization.id, clientId: appointment.clientId, attendanceId: appointment.id,
    type: "receivable", source: "attendance_extra", status: "received", description, category: "Adicionais do atendimento", amountInCents: amount,
    dueDate: today, realizedDate: today, paymentMethod, createdByUserId: session.user.id,
  }).onConflictDoNothing({ target: financialEntries.id }).returning({ id: financialEntries.id });
  if (created) await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "payment", entityType: "financial_entry", entityId: created.id, details: { appointmentId: appointment.id, amountInCents: amount } });
  revalidatePath(`/atendimento/${appointment.id}`);
  revalidatePath("/financeiro");
}
