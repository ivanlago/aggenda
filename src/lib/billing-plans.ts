export const BILLING_PLAN_IDS = ["monthly", "quarterly", "semiannual", "annual"] as const;
export type BillingPlanId = (typeof BILLING_PLAN_IDS)[number];
export type BillingPaymentMethod = "credit_card" | "pix";

const definitions = {
  monthly: { name: "Mensal", months: 1, fallback: 5 },
  quarterly: { name: "Trimestral", months: 3, fallback: 267 },
  semiannual: { name: "Semestral", months: 6, fallback: 474 },
  annual: { name: "Anual", months: 12, fallback: 828 },
} as const;

const envNames: Record<BillingPlanId, string> = {
  monthly: "ASAAS_PLAN_MONTHLY_VALUE",
  quarterly: "ASAAS_PLAN_QUARTERLY_VALUE",
  semiannual: "ASAAS_PLAN_SEMIANNUAL_VALUE",
  annual: "ASAAS_PLAN_ANNUAL_VALUE",
};

export function isBillingPlanId(value: string): value is BillingPlanId {
  return BILLING_PLAN_IDS.includes(value as BillingPlanId);
}

export function getBillingPlan(id: BillingPlanId) {
  const definition = definitions[id];
  const raw = process.env[envNames[id]];
  const value = raw ? Number(raw) : definition.fallback;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${envNames[id]} deve ser um valor positivo.`);
  }
  return { id, ...definition, value, monthlyEquivalent: value / definition.months };
}

export function getBillingPlans() {
  return BILLING_PLAN_IDS.map(getBillingPlan);
}

export function asaasBillingType(method: BillingPaymentMethod) {
  return method === "pix" ? "PIX" : "CREDIT_CARD";
}
