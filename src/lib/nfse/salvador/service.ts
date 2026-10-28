import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { db } from "../../../db";
import { financialEntries, fiscalDocuments, nfseRequests, nfseRequestEvents } from "../../../db/schema";
import { nfseVault, type NfseVault } from "../vault";
import type { SalvadorTransport } from "./transport";
import { acceptedSalvadorBatch, assertSalvadorIssuer, authorizedSalvadorInvoice, buildSalvadorBatch, buildSalvadorRpsQuery, salvadorDraftSchema, salvadorReturnCodes, salvadorRpsId, type SalvadorDraft, type SalvadorIssuer } from "./xml";

export const isSalvadorRequest = (id: string) => id.startsWith("SSA_");
export const salvadorStoredDraftSchema = z.object({
  channel: z.literal("salvador"), input: salvadorDraftSchema,
  issuer: z.object({ cnpj: z.string().regex(/^\d{14}$/), municipalRegistration: z.string().regex(/^\d{1,15}$/), municipalityCode: z.literal("2927408"), taxRegime: z.literal("lucro_presumido") }).strict(),
}).strict();
type Database = typeof db;
type Row = typeof nfseRequests.$inferSelect;
const pending = ["processing", "uncertain"];

export class SalvadorNfseService {
  constructor(private database: Database, private transport: SalvadorTransport, private actor: string | null = null, private vault: NfseVault = nfseVault()) {}
  private stored(row: Row) { return salvadorStoredDraftSchema.parse(JSON.parse(this.vault.decrypt(row.organizationId, `${row.id}/draft`, row.encryptedDraft))); }
  async get(organizationId: string, id: string) {
    const [row] = await this.database.select().from(nfseRequests).where(and(eq(nfseRequests.organizationId, organizationId), eq(nfseRequests.id, id))).limit(1);
    if (!row || !isSalvadorRequest(row.dpsId)) throw new Error("Solicitação municipal não encontrada nesta clínica.");
    if (row.environment !== "sandbox") throw new Error("Produção municipal bloqueada até homologação.");
    return row;
  }
  private event(writer: Pick<Database, "insert">, row: Pick<Row, "organizationId" | "id">, type: string, details: Record<string, unknown> = {}) {
    return writer.insert(nfseRequestEvents).values({ organizationId: row.organizationId, requestId: row.id, userId: this.actor, type, details });
  }
  private async transition(row: Row, states: string[], values: Partial<typeof nfseRequests.$inferInsert>, type: string) {
    return this.database.transaction(async (tx) => {
      const [updated] = await tx.update(nfseRequests).set({ ...values, updatedAt: new Date() }).where(and(eq(nfseRequests.id, row.id), eq(nfseRequests.organizationId, row.organizationId), sql`${nfseRequests.status} in (${sql.join(states.map((state) => sql`${state}`), sql`, `)})`)).returning();
      if (updated) await this.event(tx, updated, type);
      return updated;
    });
  }
  async draft(organizationId: string, entryId: string, issuer: SalvadorIssuer, environment: string, input: SalvadorDraft) {
    if (environment !== "sandbox") throw new Error("Produção municipal bloqueada até homologação.");
    assertSalvadorIssuer(issuer);
    const draft = salvadorDraftSchema.parse(input);
    const stored = salvadorStoredDraftSchema.parse({ channel: "salvador", issuer: { cnpj: issuer.cnpj, municipalRegistration: issuer.municipalRegistration, municipalityCode: issuer.municipalityCode, taxRegime: issuer.taxRegime }, input: draft });
    const rpsId = salvadorRpsId(issuer, draft);
    return this.database.transaction(async (tx) => {
      const [entry] = await tx.select({ id: financialEntries.id, type: financialEntries.type, status: financialEntries.status, amount: financialEntries.amountInCents }).from(financialEntries).where(and(eq(financialEntries.id, entryId), eq(financialEntries.organizationId, organizationId))).for("update");
      if (!entry || entry.type !== "receivable" || entry.status !== "received" || entry.amount !== draft.amountInCents) throw new Error("Confira o recebimento confirmado e o valor desta clínica.");
      const [external] = await tx.select({ id: fiscalDocuments.id }).from(fiscalDocuments).where(and(eq(fiscalDocuments.organizationId, organizationId), eq(fiscalDocuments.financialEntryId, entryId), eq(fiscalDocuments.status, "issued"))).limit(1);
      if (external) throw new Error("O recebimento já possui uma nota externa.");
      const [existing] = await tx.select().from(nfseRequests).where(and(eq(nfseRequests.organizationId, organizationId), eq(nfseRequests.financialEntryId, entryId), eq(nfseRequests.environment, environment), sql`${nfseRequests.status} <> 'rejected'`)).limit(1);
      if (existing && !isSalvadorRequest(existing.dpsId)) throw new Error("Já existe uma solicitação nacional para esse recebimento. Não troque o canal após preparar a emissão.");
      if (existing && existing.status !== "draft") return existing;
      const [sameRps] = await tx.select({ id: nfseRequests.id }).from(nfseRequests).where(and(eq(nfseRequests.environment, environment), eq(nfseRequests.dpsId, rpsId))).limit(1);
      if (sameRps && sameRps.id !== existing?.id) throw new Error("Esse RPS já está reservado. Consulte a solicitação original.");
      const id = existing?.id ?? randomUUID();
      const encryptedDraft = this.vault.encrypt(organizationId, `${id}/draft`, JSON.stringify(stored));
      const [row] = existing
        ? await tx.update(nfseRequests).set({ dpsId: rpsId, cnpj: issuer.cnpj, encryptedDraft, amountInCents: draft.amountInCents, updatedAt: new Date() }).where(and(eq(nfseRequests.id, id), eq(nfseRequests.status, "draft"))).returning()
        : await tx.insert(nfseRequests).values({ id, organizationId, financialEntryId: entryId, environment, cnpj: issuer.cnpj, dpsId: rpsId, amountInCents: draft.amountInCents, encryptedDraft }).returning();
      if (!row) throw new Error("A solicitação mudou. Atualize e consulte seu resultado.");
      buildSalvadorBatch(issuer, String(row.sequence), draft);
      await this.event(tx, row, existing ? "draft_updated" : "draft_created", { channel: "salvador", environment });
      return row;
    });
  }
  async submit(organizationId: string, id: string, issuer: SalvadorIssuer, sign: (xml: string) => string): Promise<unknown> {
    const row = await this.get(organizationId, id);
    if (row.status !== "draft") return this.reconcile(organizationId, id);
    const stored = this.stored(row);
    if (issuer.cnpj !== stored.issuer.cnpj || issuer.municipalRegistration !== stored.issuer.municipalRegistration || issuer.taxRegime !== stored.issuer.taxRegime || issuer.municipalityCode !== "2927408") throw new Error("O perfil fiscal mudou. Revise o rascunho municipal.");
    const built = buildSalvadorBatch(stored.issuer, String(row.sequence), stored.input);
    if (built.id !== row.dpsId || row.cnpj !== stored.issuer.cnpj) throw new Error("Identificação municipal divergente.");
    const signed = sign(built.xml);
    const claimed = await this.database.transaction(async (tx) => {
      const [entry] = await tx.select({ type: financialEntries.type, status: financialEntries.status, amount: financialEntries.amountInCents }).from(financialEntries).where(and(eq(financialEntries.organizationId, organizationId), eq(financialEntries.id, row.financialEntryId))).for("update");
      const [external] = await tx.select({ id: fiscalDocuments.id }).from(fiscalDocuments).where(and(eq(fiscalDocuments.organizationId, organizationId), eq(fiscalDocuments.financialEntryId, row.financialEntryId), eq(fiscalDocuments.status, "issued"))).limit(1);
      if (!entry || entry.type !== "receivable" || entry.status !== "received" || entry.amount !== row.amountInCents || external) throw new Error("O recebimento mudou ou já possui nota externa. Revise antes de emitir.");
      const [claim] = await tx.update(nfseRequests).set({ status: "processing", encryptedDps: this.vault.encrypt(organizationId, `${id}/dps`, signed), message: "Lote municipal enviado para homologação; aguardando confirmação.", updatedAt: new Date() }).where(and(eq(nfseRequests.id, id), eq(nfseRequests.organizationId, organizationId), eq(nfseRequests.status, "draft"), eq(nfseRequests.encryptedDraft, row.encryptedDraft))).returning();
      if (claim) await this.event(tx, claim, "submission_started", { channel: "salvador" });
      return claim;
    });
    if (!claimed) return;
    try {
      const response = await this.transport("send", signed);
      const codes = salvadorReturnCodes(response, "EnviarLoteRpsResposta");
      if (codes.length) return await this.transition(claimed, pending, { status: "uncertain", message: `Retorno municipal: ${codes.join(", ")}. Consulte o RPS e analise o retorno com o contador antes de nova tentativa.` }, "result_unconfirmed");
      const protocol = acceptedSalvadorBatch(response, String(row.sequence));
      await this.transition(claimed, pending, { message: `Lote recebido em homologação. Protocolo ${protocol}. Consulte a nota pelo RPS.` }, "municipal_batch_received");
    } catch {
      await this.transition(claimed, pending, { status: "uncertain", message: "Envio municipal não confirmado. Consulte o mesmo RPS; não haverá reenvio automático. Mensagens fiscais e duplicidades exigem análise antes de nova tentativa." }, "result_unconfirmed");
    }
  }
  async reconcile(organizationId: string, id: string) {
    const row = await this.get(organizationId, id);
    if (!pending.includes(row.status)) return;
    const { issuer, input } = this.stored(row);
    await this.event(this.database, row, "consultation_requested", { channel: "salvador" });
    try {
      const response = await this.transport("byRps", buildSalvadorRpsQuery(issuer, input));
      const codes = salvadorReturnCodes(response, "ConsultarNfseRpsResposta");
      if (codes.length) return await this.transition(row, pending, { status: "uncertain", message: `Consulta municipal: ${codes.join(", ")}. Solicitação preservada; não reenvie o RPS.` }, "result_unconfirmed");
      const note = authorizedSalvadorInvoice(response, issuer, input);
      await this.transition(row, pending, { status: "authorized", number: note.number, accessKey: note.verificationCode, encryptedXml: this.vault.encrypt(organizationId, `${id}/xml`, note.xml), message: "Nota municipal localizada em homologação, sem validade fiscal. Cancelamento somente pelo portal ou prefeitura." }, "authorized");
    } catch {
      await this.transition(row, pending, { status: "uncertain", message: "Nota municipal ainda não confirmada. Preserve o RPS e consulte novamente antes de qualquer nova emissão." }, "result_unconfirmed");
    }
  }
}
