"use server";

import { db } from "@/db";
import { revalidatePath } from "next/cache";
import { requireClinicalClient, assertClinicalIssuer, assertMedicalRegistration } from "@/lib/clinical-access";
import { requireAttendance } from "@/lib/attendance";
import { clinicalFormData, clinicalSummarySchema } from "@/lib/clinical-record";
import { ClinicalRepository } from "@/lib/clinical-repository";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export async function saveClinicalSummary(form: FormData) {
  const clientId = String(form.get("clientId") ?? "");
  const { organization, session } = await requireClinicalClient(clientId, true);
  if (form.get("reviewConfirmed") !== "on") return { error: "Confirme a revisão do resumo com o paciente." };
  const data = clinicalSummarySchema.safeParse(Object.fromEntries(["allergiesStatus", "allergies", "medications", "conditions", "history", "alerts"].map(name => [name, String(form.get(name) ?? "")])));
  if (!data.success) return { error: data.error.issues[0].message };
  await new ClinicalRepository(db).summary(organization.id, clientId, session.user.id, String(form.get("expectedVersion") ?? ""), data.data);
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/atendimento", "layout");
}

export async function saveClinicalConsultation(form: FormData) {
  const context = await requireOrganization();
  assertOrganizationPermission(context.organization.role, "clinical.manage");
  const { appointment, organization, session } = await requireAttendance(String(form.get("appointmentId") ?? ""));
  assertOrganizationPermission(organization.role, "clinical.manage");
  if (!appointment.professionalId) return { error: "Vincule o profissional responsável ao atendimento." };
  try { await assertClinicalIssuer(organization.id, session.user.id, appointment.professionalId); }
  catch { return { error: "Use o usuário vinculado ao profissional responsável pelo atendimento." }; }
  if (form.get("reviewConfirmed") !== "on") return { error: "Revise e confirme o registro antes de finalizar." };
  const requestKey = String(form.get("requestKey") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestKey)) return { error: "Reabra o formulário para registrar a consulta." };
  const parentRecordId = String(form.get("parentRecordId") ?? "") || undefined;
  let data;
  try { data = parentRecordId ? { addendum: String(form.get("addendum") ?? "") } : clinicalFormData(form); }
  catch { return { error: "Revise os campos da consulta, as medidas e os lotes. Queixa/objetivo, avaliação e plano são obrigatórios." }; }
  if ("mode" in data && data.mode === "medical") {
    try { await assertMedicalRegistration(organization.id, appointment.professionalId); }
    catch { return { error: "Cadastre o CRM e a UF do médico responsável para finalizar uma consulta médica." }; }
  }
  await new ClinicalRepository(db).record({ organizationId: organization.id, clientId: appointment.clientId, appointmentId: appointment.id, userId: session.user.id, requestKey, data, parentRecordId });
  revalidatePath(`/atendimento/${appointment.id}`);
  revalidatePath(`/clientes/${appointment.clientId}`);
}
