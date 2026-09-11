"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { clientHistoryEntries, documentTemplates } from "@/db/schema";
import { requireAttendance } from "@/lib/attendance";
import { assertOrganizationPermission } from "@/lib/permissions";
import { writeAuditLog } from "@/lib/audit";
import { issueProfessionalDocument } from "@/actions/electronic-documents";
import { updateAppointmentStatus } from "@/actions/app";
import { calculateAttendanceQuote } from "@/lib/attendance-quote";

export async function saveAttendanceNote(data: FormData) {
  const { appointment, organization, session } = await requireAttendance(String(data.get("appointmentId") ?? ""));
  assertOrganizationPermission(organization.role, "appointments.manage");
  const content = String(data.get("content") ?? "").trim();
  if (content.length < 2 || content.length > 30000) throw new Error("Informe uma anotação de 2 a 30.000 caracteres.");
  const entryType = data.get("entryType") === "anamnesis" ? "anamnesis" : "evolution";
  const [entry] = await db.insert(clientHistoryEntries).values({
    organizationId: organization.id, clientId: appointment.clientId, appointmentId: appointment.id,
    authorUserId: session.user.id, entryType,
    title: entryType === "anamnesis" ? "Anamnese do atendimento" : "Evolução do atendimento", content,
  }).returning({ id: clientHistoryEntries.id });
  await writeAuditLog({ organizationId: organization.id, userId: session.user.id, action: "create", entityType: "client_history_entry", entityId: entry.id, details: { appointmentId: appointment.id } });
  revalidatePath(`/atendimento/${appointment.id}`);
  revalidatePath(`/clientes/${appointment.clientId}`);
}

export async function issueAttendanceDocument(data: FormData) {
  const { appointment, organization, session } = await requireAttendance(String(data.get("appointmentId") ?? ""));
  assertOrganizationPermission(organization.role, "documents.manage");
  if (!appointment.professionalId) return { error: "Vincule um profissional ao agendamento antes de emitir documentos." };
  data.set("clientId", appointment.clientId);
  data.set("professionalId", appointment.professionalId);
  data.set("saveToRecord", "true");
  const kind = String(data.get("attendanceDocumentType") ?? "");
  if (["companion_declaration", "quote"].includes(kind)) {
    const title = kind === "quote" ? "Orçamento" : "Declaração de acompanhamento";
    let [template] = await db.select().from(documentTemplates).where(and(eq(documentTemplates.organizationId, organization.id), eq(documentTemplates.documentType, kind), eq(documentTemplates.isActive, true))).limit(1);
    if (!template) [template] = await db.insert(documentTemplates).values({ organizationId: organization.id, name: title, title, content: "Paciente: {{cliente}}", documentType: kind, workflowType: "professional_issue", createdByUserId: session.user.id }).returning();
    data.set("templateId", template.id);
    data.set("title", title);
    data.set("deliveryMethod", "print");
    if (kind === "quote") {
      let quote: ReturnType<typeof calculateAttendanceQuote>;
      try { quote = calculateAttendanceQuote(JSON.parse(String(data.get("quoteItems") ?? "[]"))); } catch { return { error: "Revise descrição, quantidade e valor dos itens." }; }
      const { items, total } = quote;
      const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const validity = String(data.get("validity") ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(validity) || Number.isNaN(Date.parse(validity))) return { error: "Informe a validade do orçamento." };
      const conditions = String(data.get("conditions") ?? "").trim().slice(0, 3000);
      data.set("content", `Cliente: {{cliente}}\n\n${items.map((item) => `${item.description.trim()} — ${item.quantity} x ${money(item.unitPrice)} = ${money(item.quantity * item.unitPrice)}`).join("\n")}\n\nTotal: ${money(total)}\nValidade: ${validity.split("-").reverse().join("/")}\nCondições: ${conditions || "Não informadas"}\n\nOrçamento sujeito à aprovação do cliente. Não comprova pagamento.`);
      data.set("structuredDocumentData", JSON.stringify({ items, total, validity, conditions }));
    }
  }
  return issueProfessionalDocument(data);
}

export async function updateAttendanceStatus(data: FormData) {
  const { appointment } = await requireAttendance(String(data.get("id") ?? ""));
  const result = await updateAppointmentStatus(data);
  revalidatePath(`/atendimento/${appointment.id}`);
  revalidatePath("/agenda");
  revalidatePath(`/clientes/${appointment.clientId}`);
  revalidatePath("/pacotes");
  return result;
}
