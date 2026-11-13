import { z } from "zod";

export const partnershipResponsibility = "O cadastro no Aggenda não valida o enquadramento legal da parceria. A formalização, a homologação e o cumprimento das obrigações fiscais e trabalhistas cabem às partes, conforme a legislação aplicável.";

const day = z.string().refine(value => {
  if (!value) return true;
  const parsed = new Date(`${value}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Informe uma data válida.");
export const partnershipContractSchema = z.object({
  reference: z.string().trim().max(120).default(""),
  startsOn: day.default(""), endsOn: day.default(""), terminatedOn: day.default(""),
  homologatedOn: day.default(""), authority: z.string().trim().max(240).default(""),
  protocol: z.string().trim().max(160).default(""),
  documentUrl: z.union([z.literal(""), z.url().max(2048).refine(value => new URL(value).protocol === "https:", "Use um endereço HTTPS.")]).default(""),
  paymentTerms: z.string().trim().max(2000).default(""),
  taxTerms: z.string().trim().max(2000).default(""),
  eligible: z.boolean().default(false), witnesses: z.boolean().default(false),
  clausesConfirmed: z.boolean().default(false), fiscalRegularity: z.boolean().default(false),
  responsibilityAccepted: z.boolean().default(false),
}).refine(value => !value.endsOn || !!value.startsOn && value.endsOn >= value.startsOn, "O fim da vigência deve ser igual ou posterior ao início.")
  .refine(value => !value.terminatedOn || !!value.startsOn && value.terminatedOn >= value.startsOn, "O encerramento deve ser igual ou posterior ao início.");

export type PartnershipContract = z.infer<typeof partnershipContractSchema>;
export function readPartnershipContract(value: unknown): PartnershipContract {
  const parsed = partnershipContractSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : partnershipContractSchema.parse({});
}

// This is a documentary checklist, never a certification or legal opinion.
export function partnershipPending(contract: PartnershipContract, on: string): string[] {
  const pending: string[] = [];
  if (!contract.reference) pending.push("Identificação do contrato");
  if (!contract.startsOn) pending.push("Início da vigência");
  else if (contract.startsOn > on) pending.push("Vigência ainda não iniciada");
  if (contract.endsOn && contract.endsOn < on) pending.push("Contrato vencido");
  if (contract.terminatedOn && contract.terminatedOn <= on) pending.push("Parceria encerrada");
  if (!contract.homologatedOn || !contract.authority || !contract.protocol) pending.push("Registro da homologação");
  else if (contract.homologatedOn > on) pending.push("Homologação posterior ao recebimento");
  if (!contract.documentUrl) pending.push("Referência ao documento homologado");
  if (!contract.paymentTerms) pending.push("Condições e periodicidade do repasse");
  if (!contract.taxTerms) pending.push("Responsabilidades por retenção e recolhimento");
  if (!contract.eligible) pending.push("Enquadramento da atividade");
  if (!contract.witnesses) pending.push("Duas testemunhas");
  if (!contract.clausesConfirmed) pending.push("Cláusulas obrigatórias do contrato");
  if (!contract.fiscalRegularity) pending.push("Regularidade cadastral declarada");
  if (!contract.responsibilityAccepted) pending.push("Ciência das responsabilidades");
  return pending;
}
