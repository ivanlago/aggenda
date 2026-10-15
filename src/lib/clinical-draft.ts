import { z } from "zod";
import { clinicalConsultationSchema } from "./clinical-record";

const text = z.string().max(10000).default("");
const measure = z.string().max(40).default("");
export const clinicalDraftSchema = z.object({
  mode: z.enum(["medical", "aesthetic"]), subjective: text, objective: text, assessment: text, plan: text,
  procedure: text, intercurrences: text, instructions: text, followUpDate: z.string().max(10).default(""),
  vitals: z.object({ weight: measure, height: measure, systolic: measure, diastolic: measure, heartRate: measure, temperature: measure, oxygenSaturation: measure }),
  applications: z.array(z.object({ product: z.string().max(200), lot: z.string().max(100), expiresOn: z.string().max(10), quantity: measure, unit: z.enum(["mL", "mg", "g", "UI", "unidade"]), region: z.string().max(200) })).max(20),
});
export type ClinicalDraftData = z.infer<typeof clinicalDraftSchema>;
export function blankClinicalDraft(mode: ClinicalDraftData["mode"]): ClinicalDraftData {
  return clinicalDraftSchema.parse({ mode, vitals: {}, applications: [] });
}
export function validateClinicalDraft(data: ClinicalDraftData) {
  return clinicalConsultationSchema.safeParse(data);
}
export function clinicalFieldErrors(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>) {
  const measures: Record<string, string> = { weight: "peso", height: "altura", systolic: "pressão sistólica", diastolic: "pressão diastólica", heartRate: "frequência cardíaca", temperature: "temperatura", oxygenSaturation: "saturação de oxigênio" };
  const applicationFields: Record<string, string> = { product: "o nome do produto", lot: "o lote", expiresOn: "a validade", quantity: "a quantidade", unit: "a unidade", region: "a região" };
  return Object.fromEntries(issues.map(issue => {
    const path = issue.path.join(".") || "_form";
    if (issue.path[0] === "vitals") return [path, issue.path[1] ? `Confira ${measures[String(issue.path[1])] ?? "a medida"}: use um valor numérico válido.` : "Informe os dois valores da pressão arterial."];
    if (issue.path[0] === "applications") return [path, `Aplicação ${Number(issue.path[1]) + 1}: confira ${applicationFields[String(issue.path[2])] ?? "os dados do produto"}.`];
    if (path === "_form") return [path, issue.message];
    return [path, "Confira o preenchimento deste campo antes de finalizar."];
  }));
}
export class ClinicalDraftConflict extends Error {
  constructor() { super("O rascunho mudou em outra aba ou já foi encerrado. Reabra o atendimento para conferir a versão salva; seu texto atual continua nesta tela."); }
}
