import { z } from "zod";

const text = z.string().trim().max(10000).default("");
const number = (min: number, max: number) => z.preprocess(value => value === "" || value == null ? undefined : Number(String(value).replace(",", ".")), z.number().finite().min(min).max(max).optional());
const date = z.string().refine(value => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value), "Data inválida.").default("");

export const clinicalSummarySchema = z.object({
  allergiesStatus: z.enum(["unknown", "none_reported", "reported"]),
  allergies: text, medications: text, conditions: text, history: text, alerts: text,
}).refine(data => data.allergiesStatus !== "reported" || data.allergies.length > 0, "Descreva as alergias relatadas.")
  .refine(data => data.allergiesStatus === "reported" || !data.allergies, "Selecione alergias relatadas ou remova a descrição.");
export type ClinicalSummaryData = z.infer<typeof clinicalSummarySchema>;

export const clinicalConsultationSchema = z.object({
  mode: z.enum(["medical", "aesthetic"]),
  subjective: text, objective: text, assessment: text, plan: text,
  procedure: text, intercurrences: text, instructions: text, followUpDate: date,
  vitals: z.object({
    weight: number(0.1, 700), height: number(10, 300), systolic: number(1, 400), diastolic: number(1, 300),
    heartRate: number(1, 400), temperature: number(20, 50), oxygenSaturation: number(1, 100),
  }).refine(data => (data.systolic == null) === (data.diastolic == null), "Informe os dois valores de pressão arterial."),
  applications: z.array(z.object({
    lotId: z.string().uuid().optional(),
    product: z.string().trim().min(1).max(200), lot: z.string().trim().min(1).max(100),
    expiresOn: date.refine(value => Boolean(value), "Informe a validade."),
    quantity: number(0.001, 100000).refine(value => value != null, "Informe a quantidade."),
    unit: z.enum(["mL", "mg", "g", "UI", "unidade"]), region: z.string().trim().max(200).default(""),
  })).max(50).default([]),
}).refine(data => Boolean(data.subjective && data.assessment && data.plan), "Preencha queixa/objetivo, avaliação e plano.");
export type ClinicalConsultationData = z.infer<typeof clinicalConsultationSchema>;

export function clinicalFormData(form: FormData): ClinicalConsultationData {
  const value = (name: string) => String(form.get(name) ?? "");
  const applications = value("applications");
  return clinicalConsultationSchema.parse({
    mode: value("mode"), subjective: value("subjective"), objective: value("objective"), assessment: value("assessment"), plan: value("plan"),
    procedure: value("procedure"), intercurrences: value("intercurrences"), instructions: value("instructions"), followUpDate: value("followUpDate"),
    vitals: Object.fromEntries(["weight", "height", "systolic", "diastolic", "heartRate", "temperature", "oxygenSaturation"].map(name => [name, value(name)])),
    applications: applications ? JSON.parse(applications) : [],
  });
}
