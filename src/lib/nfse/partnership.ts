import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { db } from "@/db";
import { professionalFiscalAllocations } from "@/db/schema";

const shareSchema = z.object({ id: z.uuid(), cnpj: z.string().regex(/^[A-Z0-9]{12}\d{2}$/), service: z.string().min(1), gross: z.number().int().positive(), partner: z.number().int().nonnegative(), salon: z.number().int().nonnegative() }).strict();
export const nfsePartnershipSchema = z.object({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/), shares: z.array(shareSchema).min(1), taxTreatment: z.literal("gross_value_sandbox_review") }).strict();
export type NfsePartnership = z.infer<typeof nfsePartnershipSchema>;

export function preparePartnership(shares: z.infer<typeof shareSchema>[], total: number): NfsePartnership | undefined {
  if (!shares.length) return;
  const ordered = shares.map(row => shareSchema.parse(row)).sort((a,b)=>a.id.localeCompare(b.id));
  if (ordered.some(row=>row.gross!==row.partner+row.salon) || ordered.reduce((sum,row)=>sum+row.gross,0)>total) throw new Error("As cotas-partes não correspondem ao valor deste recebimento. Revise a apuração.");
  return { fingerprint: createHash("sha256").update(JSON.stringify(ordered)).digest("hex"), shares: ordered, taxTreatment: "gross_value_sandbox_review" };
}

export async function loadNfsePartnership(database: Pick<typeof db,"select">, organizationId: string, entryId: string, total: number) {
  const rows = await database.select({ id:professionalFiscalAllocations.id, snapshot:professionalFiscalAllocations.snapshot, gross:professionalFiscalAllocations.grossInCents, partner:professionalFiscalAllocations.partnerInCents, salon:professionalFiscalAllocations.salonInCents }).from(professionalFiscalAllocations).where(and(eq(professionalFiscalAllocations.organizationId,organizationId),eq(professionalFiscalAllocations.financialEntryId,entryId),isNull(professionalFiscalAllocations.voidedAt)));
  return preparePartnership(rows.map(row=>({id:row.id,cnpj:row.snapshot.cnpj,service:row.snapshot.serviceName,gross:row.gross,partner:row.partner,salon:row.salon})),total);
}

export function describeNfsePartnership(description: string, partnership: NfsePartnership | undefined, maxLength: number) {
  if (!partnership) return description;
  const money = (cents:number)=>(cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const lines = partnership.shares.map(row=>`${row.service}: total ${money(row.gross)}; cota-parte salão ${money(row.salon)}; cota-parte profissional ${money(row.partner)}; CNPJ ${row.cnpj}.`);
  const result = `${description.trim()}\nSalão Parceiro — discriminação de cotas-partes:\n${lines.join("\n")}`;
  if (result.length>maxLength) throw new Error("Reduza a descrição do serviço para incluir todas as cotas-partes no limite do conector fiscal.");
  return result;
}

export function assertNfsePartnership(current: NfsePartnership | undefined, saved: NfsePartnership | undefined) {
  if (JSON.stringify(current)!==JSON.stringify(saved)) throw new Error("A apuração da parceria mudou. Prepare e revise um novo rascunho antes de emitir.");
}
