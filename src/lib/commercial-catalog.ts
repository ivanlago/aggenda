import { z } from "zod";

export const commercialSelectionSchema = z.object({
  product: z.enum(["essential", "professional", "complete"]),
  cycle: z.enum(["monthly", "semiannual", "annual"]),
  professionals: z.coerce.number().refine((n) => [1, 2, 3, 5, 10].includes(n)),
  signatures: z.boolean().default(false),
  nfse: z.enum(["none", "50", "150", "500"]).default("none"),
});
export type CommercialSelection = z.infer<typeof commercialSelectionSchema>;
export const commercialProducts = {
  essential: { name: "Essencial", agent: "assisted", monthly: 0 },
  professional: { name: "Profissional", agent: "chat_ai", monthly: 9990 },
  complete: { name: "Completo", agent: "core_ai", monthly: 19990 },
} as const;
export const professionalPrices: Record<number, number> = { 1: 4990, 2: 6880, 3: 8770, 5: 10670, 10: 13420 };
export const formatBrl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function commercialQuote(input: CommercialSelection) {
  const selection = commercialSelectionSchema.parse(input);
  const months = { monthly: 1, semiannual: 6, annual: 12 }[selection.cycle];
  const factor = { monthly: 1, semiannual: 0.9, annual: 0.8 }[selection.cycle];
  const modules = commercialProducts[selection.product].monthly + (selection.signatures ? 1990 : 0)
    + ({ none: 0, "50": 2990, "150": 4990, "500": 9990 }[selection.nfse]);
  // The approved annual base is R$39.90, not the R$39.92 produced by 20%.
  const app = selection.cycle === "annual" ? 3990 + Math.round((professionalPrices[selection.professionals] - 4990) * factor)
    : Math.round(professionalPrices[selection.professionals] * factor);
  const equivalent = app + Math.round(modules * factor);
  return { ...selection, name: commercialProducts[selection.product].name, months, amountInCents: equivalent * months,
    equivalentInCents: equivalent, agent: commercialProducts[selection.product].agent,
    responses: selection.product === "essential" ? 0 : 1000, documents: selection.signatures ? 50 : 0,
    notes: selection.nfse === "none" ? 0 : Number(selection.nfse), kind: "commercial" as const };
}

export function pilotQuote() {
  return { product: "complete" as const, cycle: "annual" as const, professionals: 3, signatures: true, nfse: "none" as const,
    name: "Completo — piloto anual", months: 12, amountInCents: 500, equivalentInCents: null,
    agent: "core_ai" as const, responses: 1000, documents: 30, notes: 10, kind: "pilot" as const };
}
export function extraQuote(metric: "responses" | "documents") {
  return { ...pilotQuote(), kind: "extra" as const, name: metric === "responses" ? "500 respostas adicionais" : "100 documentos adicionais",
    months: 1, amountInCents: metric === "responses" ? 4990 : 1990, extraMetric: metric, extraQuantity: metric === "responses" ? 500 : 100 };
}
export type CommercialQuote = ReturnType<typeof commercialQuote> | ReturnType<typeof pilotQuote> | ReturnType<typeof extraQuote>;

export function addCalendarMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return result;
}
