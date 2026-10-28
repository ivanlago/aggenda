import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { db } from "../../db";
import { financialEntries, fiscalDocuments, nfseRequests, nfseRequestEvents } from "../../db/schema";
import type { NfseFiscalProfile } from "../nfse-routing";
import { authorizedInvoice, buildDps, buildCancellation, confirmedCancellation, fiscalDraftSchema, type FiscalDraft } from "./xml";
import { compressFiscalXml, decompressFiscalXml, definitiveFiscalRejection, fiscalRejection, type FiscalEnvironment, type FiscalTransport } from "./government";
import { nfseVault, readStoredNfseValue, type NfseVault } from "./vault";

type Database = typeof db;
type Request = typeof nfseRequests.$inferSelect;
type Writer = Pick<Database, "insert">;
const pending = ["processing", "uncertain"];
const cancellationPending = ["cancellation_processing", "cancellation_uncertain"];

export class NfseService {
  constructor(private database: Database, private transport: FiscalTransport, private actor: string | null = null, private vault: NfseVault = nfseVault()) {}

  private event(writer: Writer, row: Pick<Request, "id" | "organizationId">, type: string, details: Record<string, unknown> = {}) {
    return writer.insert(nfseRequestEvents).values({ organizationId: row.organizationId, requestId: row.id, userId: this.actor, type, details });
  }

  async draft(organizationId: string, entryId: string, profile: NfseFiscalProfile, environment: FiscalEnvironment, input: FiscalDraft) {
    const draft = fiscalDraftSchema.parse(input);
    if (environment !== "sandbox") throw new Error("Emissão em produção aguarda homologação fiscal do Aggenda.");
    return this.database.transaction(async (tx) => {
      const [entry] = await tx.select({ id: financialEntries.id, type: financialEntries.type, status: financialEntries.status, amountInCents: financialEntries.amountInCents }).from(financialEntries).where(and(eq(financialEntries.id, entryId), eq(financialEntries.organizationId, organizationId))).for("update");
      if (!entry || entry.type !== "receivable" || entry.status !== "received" || entry.amountInCents !== draft.amountInCents) throw new Error("Selecione um recebimento confirmado da clínica e confira o valor.");
      const [external] = await tx.select({ id: fiscalDocuments.id }).from(fiscalDocuments).where(and(eq(fiscalDocuments.organizationId, organizationId), eq(fiscalDocuments.financialEntryId, entryId), eq(fiscalDocuments.status, "issued"))).limit(1);
      if (external) throw new Error("Já existe uma nota externa vinculada a este recebimento.");
      const [existing] = await tx.select().from(nfseRequests).where(and(eq(nfseRequests.organizationId, organizationId), eq(nfseRequests.financialEntryId, entryId), eq(nfseRequests.environment, environment), sql`${nfseRequests.status} <> 'rejected'`));
      if (existing?.dpsId.startsWith("SSA_")) throw new Error("Este recebimento possui uma solicitação municipal de Salvador. Utilize o conector original.");
      if (existing && existing.status !== "draft") return existing;
      if (existing) {
        const built = buildDps(profile, environment, profile.dpsSeries ?? "1", String(existing.sequence), draft);
        const [updated] = await tx.update(nfseRequests).set({ cnpj: profile.cnpj, dpsId: built.id, encryptedDraft: this.vault.encrypt(organizationId, `${existing.id}/draft`, JSON.stringify(draft)), amountInCents: draft.amountInCents, updatedAt: new Date() }).where(and(eq(nfseRequests.id, existing.id), eq(nfseRequests.status, "draft"))).returning();
        if (!updated) throw new Error("A solicitação já está sendo emitida. Consulte seu resultado.");
        await this.event(tx, updated, "draft_updated");
        return updated;
      }
      const id = randomUUID();
      const [created] = await tx.insert(nfseRequests).values({ id, organizationId, financialEntryId: entryId, environment, cnpj: profile.cnpj, dpsId: id, amountInCents: draft.amountInCents, encryptedDraft: this.vault.encrypt(organizationId, `${id}/draft`, JSON.stringify(draft)) }).returning();
      const built = buildDps(profile, environment, profile.dpsSeries ?? "1", String(created.sequence), draft);
      const [updated] = await tx.update(nfseRequests).set({ dpsId: built.id }).where(eq(nfseRequests.id, id)).returning();
      await this.event(tx, updated, "draft_created", { environment });
      return updated;
    });
  }

  async get(organizationId: string, id: string) {
    const [row] = await this.database.select().from(nfseRequests).where(and(eq(nfseRequests.id, id), eq(nfseRequests.organizationId, organizationId))).limit(1);
    if (!row) throw new Error("Solicitação fiscal não encontrada.");
    if (row.dpsId.startsWith("SSA_")) throw new Error("Utilize o conector municipal de Salvador para esta solicitação.");
    return row;
  }

  async submit(organizationId: string, id: string, profile: NfseFiscalProfile, sign: (xml: string) => string): Promise<unknown> {
    const row = await this.get(organizationId, id);
    if (row.environment !== "sandbox") throw new Error("Produção aguarda homologação.");
    if (row.status !== "draft") return this.reconcile(organizationId, id);
    const draft = fiscalDraftSchema.parse(JSON.parse(readStoredNfseValue(organizationId, `${id}/draft`, row.encryptedDraft)));
    const built = buildDps(profile, "sandbox", profile.dpsSeries ?? "1", String(row.sequence), draft);
    if (built.id !== row.dpsId || profile.cnpj !== row.cnpj) throw new Error("O cadastro fiscal mudou. Revise a solicitação antes de emitir.");
    const signed = sign(built.xml);
    const claimed = await this.database.transaction(async (tx) => {
      const [entry] = await tx.select({ id: financialEntries.id, type: financialEntries.type, status: financialEntries.status, amountInCents: financialEntries.amountInCents }).from(financialEntries).where(and(eq(financialEntries.id, row.financialEntryId), eq(financialEntries.organizationId, organizationId))).for("update");
      if (!entry || entry.type !== "receivable" || entry.status !== "received" || entry.amountInCents !== row.amountInCents) throw new Error("O recebimento mudou. Revise o rascunho antes de emitir.");
      const [external] = await tx.select({ id: fiscalDocuments.id }).from(fiscalDocuments).where(and(eq(fiscalDocuments.organizationId, organizationId), eq(fiscalDocuments.financialEntryId, row.financialEntryId), eq(fiscalDocuments.status, "issued"))).limit(1);
      if (external) throw new Error("Já existe uma nota externa vinculada a este recebimento.");
      const [claim] = await tx.update(nfseRequests).set({ status: "processing", encryptedDps: this.vault.encrypt(organizationId, `${id}/dps`, signed), message: "Envio iniciado. Consulte o resultado antes de qualquer nova tentativa.", updatedAt: new Date() }).where(and(eq(nfseRequests.id, id), eq(nfseRequests.organizationId, organizationId), eq(nfseRequests.status, "draft"), eq(nfseRequests.encryptedDraft, row.encryptedDraft))).returning();
      if (claim) await this.event(tx, claim, "submission_started");
      return claim;
    });
    if (!claimed) return;
    try {
      const response = await this.transport("/nfse", { method: "POST", body: { dpsXmlGZipB64: compressFiscalXml(signed) } });
      if (response.status >= 200 && response.status < 300 && response.body.nfseXmlGZipB64) return await this.authorize(claimed, decompressFiscalXml(response.body.nfseXmlGZipB64));
      const rejection = definitiveFiscalRejection(response, claimed.dpsId);
      if (rejection) return await this.transition(claimed, pending, { status: "rejected", message: rejection }, "rejected");
      await this.markUncertain(claimed, fiscalRejection(response) ?? "O resultado da emissão ainda não foi confirmado. Consulte a DPS.");
    } catch {
      await this.markUncertain(claimed, "A emissão pode ter sido recebida. Consulte o resultado; o Aggenda não reenviará automaticamente.");
    }
  }

  private async transition(row: Request, from: string[], values: Partial<typeof nfseRequests.$inferInsert>, type: string) {
    return this.database.transaction(async (tx) => {
      const [updated] = await tx.update(nfseRequests).set({ ...values, updatedAt: new Date() }).where(and(eq(nfseRequests.id, row.id), eq(nfseRequests.organizationId, row.organizationId), sql`${nfseRequests.status} in (${sql.join(from.map((state) => sql`${state}`), sql`, `)})`)).returning();
      if (updated) await this.event(tx, updated, type, { status: updated.status });
      return updated;
    });
  }
  private markUncertain(row: Request, message: string) {
    return this.transition(row, pending, { status: "uncertain", message }, "result_unconfirmed");
  }

  async reconcile(organizationId: string, id: string): Promise<unknown> {
    const row = await this.get(organizationId, id);
    if (row.environment !== "sandbox") throw new Error("Produção aguarda homologação.");
    if (cancellationPending.includes(row.status)) return this.reconcileCancellation(row);
    if (!pending.includes(row.status)) return;
    await this.event(this.database, row, "consultation_requested");
    try {
      const lookup = await this.transport(`/dps/${row.dpsId}`);
      const key = lookup.body.chaveAcesso;
      if (lookup.status !== 200 || typeof key !== "string" || !/^\d{50}$/.test(key)) return await this.markUncertain(row, "Nota ainda não localizada ou consulta indisponível. Solicitação preservada para nova consulta.");
      const invoice = await this.transport(`/nfse/${key}`);
      if (invoice.status !== 200) return await this.markUncertain(row, "Chave localizada; aguardando recuperação do XML autorizado.");
      await this.authorize(row, decompressFiscalXml(invoice.body.nfseXmlGZipB64));
    } catch { await this.markUncertain(row, "Consulta indisponível. Aguarde e consulte novamente; a solicitação foi preservada."); }
  }

  private async authorize(row: Request, xml: string) {
    const invoice = authorizedInvoice(xml, { dpsId: row.dpsId, cnpj: row.cnpj, environment: row.environment as FiscalEnvironment, amountInCents: row.amountInCents });
    await this.transition(row, pending, { status: "authorized", encryptedXml: this.vault.encrypt(row.organizationId, `${row.id}/xml`, xml), accessKey: invoice.key, number: invoice.number, message: "Nota autorizada em homologação. Sem validade fiscal." }, "authorized");
  }

  async cancel(organizationId: string, id: string, profile: NfseFiscalProfile, reason: string, code: string, sign: (xml: string) => string): Promise<unknown> {
    const row = await this.get(organizationId, id);
    if (row.environment !== "sandbox" || row.cnpj !== profile.cnpj) throw new Error("Cadastro ou ambiente incompatível com o cancelamento.");
    if (cancellationPending.includes(row.status)) return this.reconcileCancellation(row);
    if (row.status !== "authorized" || !row.accessKey) throw new Error("Somente uma nota autorizada pode ser cancelada.");
    const signed = sign(buildCancellation(row.accessKey, row.cnpj, "sandbox", reason, code));
    const claimed = await this.transition(row, ["authorized"], { status: "cancellation_processing", encryptedCancellation: this.vault.encrypt(organizationId, `${id}/cancellation`, signed), message: "Pedido de cancelamento enviado. Aguarde a confirmação do governo." }, "cancellation_started");
    if (!claimed) return;
    try {
      const response = await this.transport(`/nfse/${row.accessKey}/eventos`, { method: "POST", body: { pedidoRegistroEventoXmlGZipB64: compressFiscalXml(signed) } });
      if (response.status >= 200 && response.status < 300 && response.body.eventoXmlGZipB64) return await this.acceptCancellation(claimed, decompressFiscalXml(response.body.eventoXmlGZipB64));
    } catch { /* Unknown cancellation results must be queried, never blindly resubmitted. */ }
    await this.transition(claimed, cancellationPending, { status: "cancellation_uncertain", message: "Cancelamento não confirmado. A nota não foi marcada como cancelada; consulte o evento." }, "cancellation_unconfirmed");
  }

  private async reconcileCancellation(row: Request) {
    await this.event(this.database, row, "cancellation_consultation");
    try {
      const result = await this.transport(`/nfse/${row.accessKey}/eventos/101101/1`);
      if (result.status === 200 && result.body.eventoXmlGZipB64) return await this.acceptCancellation(row, decompressFiscalXml(result.body.eventoXmlGZipB64));
    } catch { /* Preserve the original event identifier and payload. */ }
    await this.transition(row, cancellationPending, { status: "cancellation_uncertain", message: "Não foi possível confirmar o cancelamento. Consulte novamente antes de qualquer outra operação." }, "cancellation_unconfirmed");
  }

  private async acceptCancellation(row: Request, xml: string) {
    confirmedCancellation(xml, { key: row.accessKey!, cnpj: row.cnpj, environment: "sandbox" });
    await this.transition(row, cancellationPending, { status: "cancelled", encryptedEvent: this.vault.encrypt(row.organizationId, `${row.id}/event`, xml), message: "Cancelamento confirmado em homologação." }, "cancelled");
  }
}
