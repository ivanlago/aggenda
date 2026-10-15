import { and, eq } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import type { db } from "../db";
import { appointments, auditLogs, clinicalConsultationDrafts, clinicalConsultationRecords } from "../db/schema";
import { ClinicalRepository } from "./clinical-repository";
import { ClinicalDraftConflict, clinicalDraftSchema, validateClinicalDraft, type ClinicalDraftData } from "./clinical-draft";

type Identity = { organizationId: string; clientId: string; appointmentId: string; userId: string; id: string; version: number };

/** Internal persistence. Entry points must check session, clinical permission and assigned issuer. */
export class ClinicalDraftRepository {
  constructor(private readonly database: typeof db) {}

  async save(input: Identity & { data: ClinicalDraftData }) {
    const data = clinicalDraftSchema.parse(input.data);
    return this.database.transaction(async tx => {
      const [appointment] = await tx.select({ status: appointments.status }).from(appointments).where(and(eq(appointments.organizationId, input.organizationId), eq(appointments.clientId, input.clientId), eq(appointments.id, input.appointmentId))).for("update");
      if (!appointment || ["cancelled", "no_show"].includes(appointment.status)) throw new Error("Atendimento indisponível para novo registro.");
      const [byId] = await tx.select().from(clinicalConsultationDrafts).where(and(eq(clinicalConsultationDrafts.id, input.id), eq(clinicalConsultationDrafts.organizationId, input.organizationId))).for("update");
      if (byId) {
        if (byId.organizationId !== input.organizationId || byId.appointmentId !== input.appointmentId || byId.clientId !== input.clientId || byId.userId !== input.userId || byId.status !== "active") throw new ClinicalDraftConflict();
        // Recover an accepted write whose response was lost, without overwriting another edit.
        if (isDeepStrictEqual(byId.data, data) && (byId.version === input.version || byId.version === input.version + 1)) return { version: byId.version, savedAt: byId.updatedAt.toISOString() };
        if (byId.version !== input.version) throw new ClinicalDraftConflict();
        const [updated] = await tx.update(clinicalConsultationDrafts).set({ data, version: byId.version + 1, updatedAt: new Date() }).where(eq(clinicalConsultationDrafts.id, input.id)).returning();
        return { version: updated.version, savedAt: updated.updatedAt.toISOString() };
      }
      if (input.version !== 0) throw new ClinicalDraftConflict();
      const [active] = await tx.select({ id: clinicalConsultationDrafts.id }).from(clinicalConsultationDrafts).where(and(eq(clinicalConsultationDrafts.organizationId, input.organizationId), eq(clinicalConsultationDrafts.appointmentId, input.appointmentId), eq(clinicalConsultationDrafts.userId, input.userId), eq(clinicalConsultationDrafts.status, "active"))).limit(1);
      if (active) throw new ClinicalDraftConflict();
      const [row] = await tx.insert(clinicalConsultationDrafts).values({ id: input.id, organizationId: input.organizationId, clientId: input.clientId, appointmentId: input.appointmentId, userId: input.userId, data }).returning();
      await tx.insert(auditLogs).values({ organizationId: input.organizationId, userId: input.userId, action: "create", entityType: "clinical_draft", entityId: row.id });
      return { version: row.version, savedAt: row.updatedAt.toISOString() };
    });
  }

  async finalize(input: Identity) {
    return this.database.transaction(async tx => {
      // Keep the same lock order as save and the finalized record repository.
      const [appointment] = await tx.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.organizationId, input.organizationId), eq(appointments.clientId, input.clientId), eq(appointments.id, input.appointmentId))).for("update");
      if (!appointment) throw new ClinicalDraftConflict();
      const [draft] = await tx.select().from(clinicalConsultationDrafts).where(and(eq(clinicalConsultationDrafts.id, input.id), eq(clinicalConsultationDrafts.organizationId, input.organizationId), eq(clinicalConsultationDrafts.clientId, input.clientId), eq(clinicalConsultationDrafts.appointmentId, input.appointmentId), eq(clinicalConsultationDrafts.userId, input.userId))).for("update");
      if (!draft) throw new ClinicalDraftConflict();
      if (draft.status === "finalized") {
        const [record] = await tx.select({ id: clinicalConsultationRecords.id }).from(clinicalConsultationRecords).where(and(eq(clinicalConsultationRecords.organizationId, input.organizationId), eq(clinicalConsultationRecords.requestKey, input.id), eq(clinicalConsultationRecords.authorUserId, input.userId))).limit(1);
        if (record) return record;
      }
      if (draft.status !== "active" || draft.version !== input.version) throw new ClinicalDraftConflict();
      const parsed = validateClinicalDraft(clinicalDraftSchema.parse(draft.data));
      if (!parsed.success) throw parsed.error;
      const repository = new ClinicalRepository(tx as unknown as typeof db);
      const record = await repository.record({ ...input, requestKey: input.id, data: parsed.data });
      await tx.update(clinicalConsultationDrafts).set({ status: "finalized", data: {}, version: draft.version + 1, updatedAt: new Date() }).where(eq(clinicalConsultationDrafts.id, input.id));
      return record;
    });
  }
}
