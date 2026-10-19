import { and, desc, eq } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import type { db } from "../db";
import { appointments, auditLogs, clients, clinicalConsultationRecords, clinicalSummaryVersions } from "../db/schema";
import { clinicalConsultationSchema, clinicalSummarySchema, type ClinicalConsultationData, type ClinicalSummaryData } from "./clinical-record";
import { consumeClinicalLots } from "./clinical-lot-consumption";

/** Internal persistence: callers must authorize session, role and professional scope. */
export class ClinicalRepository {
  constructor(private readonly database: typeof db) {}

  async summary(organizationId: string, clientId: string, userId: string, expectedVersion: string, data: ClinicalSummaryData) {
    const parsed = clinicalSummarySchema.parse(data);
    return this.database.transaction(async tx => {
      const [client] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.organizationId, organizationId), eq(clients.id, clientId))).for("update");
      if (!client) throw new Error("Paciente não encontrado.");
      const [latest] = await tx.select({ id: clinicalSummaryVersions.id }).from(clinicalSummaryVersions).where(and(eq(clinicalSummaryVersions.organizationId, organizationId), eq(clinicalSummaryVersions.clientId, clientId))).orderBy(desc(clinicalSummaryVersions.createdAt), desc(clinicalSummaryVersions.id)).limit(1);
      if ((latest?.id ?? "") !== expectedVersion) throw new Error("O resumo foi atualizado por outra pessoa. Reabra a página antes de salvar.");
      const [row] = await tx.insert(clinicalSummaryVersions).values({ organizationId, clientId, authorUserId: userId, data: parsed }).returning({ id: clinicalSummaryVersions.id });
      await tx.insert(auditLogs).values({ organizationId, userId, action: "create", entityType: "clinical_summary", entityId: row.id });
      return row;
    });
  }

  async record(input: { organizationId: string; clientId: string; appointmentId: string; userId: string; requestKey: string; data: ClinicalConsultationData | { addendum: string }; parentRecordId?: string }) {
    const data = input.parentRecordId ? { addendum: String((input.data as { addendum: string }).addendum ?? "").trim() } :
      JSON.parse(JSON.stringify(clinicalConsultationSchema.parse(input.data))) as ClinicalConsultationData;
    if ("addendum" in data && (data.addendum.length < 2 || data.addendum.length > 10000)) throw new Error("Informe um adendo de 2 a 10.000 caracteres.");
    return this.database.transaction(async tx => {
      const [appointment] = await tx.select({ status: appointments.status }).from(appointments).where(and(eq(appointments.organizationId, input.organizationId), eq(appointments.id, input.appointmentId), eq(appointments.clientId, input.clientId))).for("update");
      if (!appointment) throw new Error("Atendimento não encontrado.");
      const [existing] = await tx.select().from(clinicalConsultationRecords).where(and(eq(clinicalConsultationRecords.organizationId, input.organizationId), eq(clinicalConsultationRecords.requestKey, input.requestKey))).limit(1);
      if (existing) {
        if (existing.appointmentId !== input.appointmentId || existing.clientId !== input.clientId || existing.authorUserId !== input.userId || (existing.parentRecordId ?? undefined) !== input.parentRecordId || !isDeepStrictEqual(existing.data, data)) throw new Error("Solicitação reutilizada com outros dados.");
        return { id: existing.id };
      }
      if (!input.parentRecordId && ["cancelled", "no_show"].includes(appointment.status)) throw new Error("Não registre uma consulta em atendimento cancelado ou com falta.");
      if (input.parentRecordId) {
        const [parent] = await tx.select({ kind: clinicalConsultationRecords.kind }).from(clinicalConsultationRecords).where(and(eq(clinicalConsultationRecords.organizationId, input.organizationId), eq(clinicalConsultationRecords.clientId, input.clientId), eq(clinicalConsultationRecords.appointmentId, input.appointmentId), eq(clinicalConsultationRecords.id, input.parentRecordId))).limit(1);
        if (parent?.kind !== "evolution") throw new Error("Registro original não encontrado neste atendimento.");
      }
      const [row] = await tx.insert(clinicalConsultationRecords).values({ organizationId: input.organizationId, clientId: input.clientId, appointmentId: input.appointmentId, authorUserId: input.userId, requestKey: input.requestKey, kind: input.parentRecordId ? "addendum" : "evolution", parentRecordId: input.parentRecordId, data }).returning({ id: clinicalConsultationRecords.id });
      if (!("addendum" in data)) await consumeClinicalLots(tx, { ...input, recordId: row.id, appointmentStatus: appointment.status, data });
      await tx.insert(auditLogs).values({ organizationId: input.organizationId, userId: input.userId, action: "create", entityType: "clinical_record", entityId: row.id, details: { appointmentId: input.appointmentId, kind: input.parentRecordId ? "addendum" : "evolution" } });
      return row;
    });
  }
}
