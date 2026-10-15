"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { clinicalConsultationDrafts } from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireAttendance } from "@/lib/attendance";
import { assertClinicalIssuer, assertMedicalRegistration } from "@/lib/clinical-access";
import { ClinicalDraftConflict, clinicalDraftSchema, clinicalFieldErrors } from "@/lib/clinical-draft";
import { ClinicalDraftRepository } from "@/lib/clinical-draft-repository";

const identitySchema = z.object({ appointmentId: z.uuid(), id: z.uuid(), version: z.number().int().min(0) });
async function context(appointmentId: string) {
  const sessionContext = await requireOrganization();
  assertOrganizationPermission(sessionContext.organization.role, "clinical.manage");
  const ctx = await requireAttendance(appointmentId);
  if (!ctx.appointment.professionalId) throw new Error("Vincule o profissional ao atendimento.");
  await assertClinicalIssuer(ctx.organization.id, ctx.session.user.id, ctx.appointment.professionalId);
  return ctx;
}
type Failure = { ok: false; error: string; conflict?: boolean; fieldErrors?: Record<string, string> };
export async function saveClinicalDraft(input: { appointmentId: string; id: string; version: number; data: unknown }): Promise<Failure | { ok: true; version: number; savedAt: string }> {
  const identity = identitySchema.safeParse(input);
  if (!identity.success) return { ok: false, error: "Reabra o atendimento para recuperar o rascunho." };
  const ctx = await context(identity.data.appointmentId);
  const parsed = clinicalDraftSchema.safeParse(input.data);
  if (!parsed.success) return { ok: false, error: "O rascunho excede os limites dos campos. Revise o texto e os produtos." };
  try {
    const saved = await new ClinicalDraftRepository(db).save({ ...identity.data, organizationId: ctx.organization.id, clientId: ctx.appointment.clientId, userId: ctx.session.user.id, data: parsed.data });
    return { ok: true, ...saved };
  } catch (error) {
    if (error instanceof ClinicalDraftConflict) return { ok: false, error: error.message, conflict: true };
    return { ok: false, error: "Não foi possível salvar no servidor. Seu texto permanece nesta tela; tente salvar novamente antes de sair." };
  }
}

export async function finalizeClinicalDraft(input: { appointmentId: string; id: string; version: number; reviewConfirmed: boolean }): Promise<Failure | { ok: true; recordId: string }> {
  const identity = identitySchema.safeParse(input);
  if (!identity.success || !input.reviewConfirmed) return { ok: false, error: "Revise o registro e confirme a finalização." };
  const ctx = await context(identity.data.appointmentId);
  const [draft] = await db.select().from(clinicalConsultationDrafts).where(and(eq(clinicalConsultationDrafts.id, input.id), eq(clinicalConsultationDrafts.organizationId, ctx.organization.id), eq(clinicalConsultationDrafts.appointmentId, ctx.appointment.id), eq(clinicalConsultationDrafts.userId, ctx.session.user.id))).limit(1);
  if (!draft) return { ok: false, error: "Salve o rascunho antes de finalizar." };
  if (draft.status === "active" && draft.data.mode === "medical") {
    try { await assertMedicalRegistration(ctx.organization.id, ctx.appointment.professionalId!); }
    catch { return { ok: false, error: "Cadastre o CRM e a UF do médico responsável antes de finalizar uma consulta médica." }; }
  }
  try {
    const record = await new ClinicalDraftRepository(db).finalize({ ...identity.data, organizationId: ctx.organization.id, clientId: ctx.appointment.clientId, userId: ctx.session.user.id });
    revalidatePath(`/atendimento/${ctx.appointment.id}`); revalidatePath(`/clientes/${ctx.appointment.clientId}`);
    return { ok: true, recordId: record.id };
  } catch (error) {
    if (error instanceof ClinicalDraftConflict) return { ok: false, error: error.message, conflict: true };
    if (error instanceof z.ZodError) return { ok: false, error: "Confira os campos indicados antes de finalizar.", fieldErrors: clinicalFieldErrors(error.issues) };
    return { ok: false, error: "O registro não foi finalizado. O rascunho continua salvo; tente novamente." };
  }
}
