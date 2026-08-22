export type AnamnesisFieldType = "short_text" | "long_text" | "number" | "date" | "yes_no" | "single_choice" | "multiple_choice";

export type AnamnesisCondition = { fieldId: string; equals: string };

export type AnamnesisField = {
  id: string;
  label: string;
  type: AnamnesisFieldType;
  required?: boolean;
  options?: string[];
  helpText?: string;
  alertWhen?: string;
  condition?: AnamnesisCondition;
};

export type AnamnesisAnswer = string | string[];
export type AnamnesisAnswers = Record<string, AnamnesisAnswer>;

export function isAnamnesisSchema(value: unknown): value is AnamnesisField[] {
  return Array.isArray(value) && value.every((field) => field && typeof field === "object" && typeof field.id === "string" && typeof field.label === "string" && typeof field.type === "string");
}

export function visibleAnamnesisFields(schema: AnamnesisField[], answers: AnamnesisAnswers) {
  return schema.filter((field) => !field.condition || String(answers[field.condition.fieldId] ?? "") === field.condition.equals);
}

export function anamnesisAnswersToText(schema: AnamnesisField[], answers: AnamnesisAnswers) {
  return visibleAnamnesisFields(schema, answers).map((field) => {
    const answer = answers[field.id];
    const value = Array.isArray(answer) ? answer.join(", ") : String(answer ?? "Não informado");
    return `${field.label}\n${value || "Não informado"}`;
  }).join("\n\n");
}

const generalFields: AnamnesisField[] = [
  { id: "main_complaint", label: "Qual é a principal queixa ou objetivo do atendimento?", type: "long_text", required: true },
  { id: "allergies", label: "Possui alguma alergia?", type: "yes_no", required: true, alertWhen: "Sim" },
  { id: "allergies_details", label: "Quais alergias?", type: "long_text", required: true, condition: { fieldId: "allergies", equals: "Sim" } },
  { id: "continuous_medication", label: "Usa medicamentos continuamente?", type: "yes_no", required: true, alertWhen: "Sim" },
  { id: "continuous_medication_details", label: "Informe medicamentos, doses e frequência", type: "long_text", required: true, condition: { fieldId: "continuous_medication", equals: "Sim" } },
  { id: "health_conditions", label: "Condições de saúde, diagnósticos ou tratamentos atuais", type: "long_text" },
  { id: "surgeries", label: "Cirurgias, internações ou procedimentos anteriores", type: "long_text" },
  { id: "family_history", label: "Antecedentes familiares relevantes", type: "long_text" },
  { id: "habits", label: "Hábitos relevantes", type: "multiple_choice", options: ["Tabagismo", "Consumo de álcool", "Atividade física", "Nenhum"] },
  { id: "additional_information", label: "Existe outra informação importante para um atendimento seguro?", type: "long_text" },
];

const aestheticFields: AnamnesisField[] = [
  { id: "goal", label: "Qual é o objetivo e a expectativa com o procedimento?", type: "long_text", required: true },
  { id: "previous_procedure", label: "Já realizou este ou outro procedimento na região?", type: "yes_no", required: true },
  { id: "previous_procedure_details", label: "Qual procedimento, quando e qual foi o resultado?", type: "long_text", required: true, condition: { fieldId: "previous_procedure", equals: "Sim" } },
  { id: "allergies", label: "Possui alergias ou sensibilidade conhecida?", type: "yes_no", required: true, alertWhen: "Sim" },
  { id: "allergies_details", label: "Quais alergias ou sensibilidades?", type: "long_text", required: true, condition: { fieldId: "allergies", equals: "Sim" } },
  { id: "pregnancy", label: "Está gestante ou amamentando?", type: "yes_no", required: true, alertWhen: "Sim" },
  { id: "anticoagulant", label: "Usa anticoagulante?", type: "yes_no", required: true, alertWhen: "Sim" },
  { id: "medications", label: "Medicamentos, ácidos ou retinoides em uso", type: "long_text" },
  { id: "skin_conditions", label: "Doenças de pele, feridas, infecções ou tendência a queloide", type: "long_text" },
  { id: "sun_exposure", label: "Exposição solar recente ou prevista", type: "long_text" },
  { id: "additional_information", label: "Outras informações importantes", type: "long_text" },
];

export const anamnesisPresets = [
  { name: "Anamnese clínica geral", title: "Anamnese clínica geral", fields: generalFields },
  { name: "Anamnese estética geral", title: "Anamnese estética geral", fields: aestheticFields },
] as const;
