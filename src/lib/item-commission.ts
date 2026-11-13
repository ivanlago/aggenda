/** Percentages are persisted as hundredths, never floating point money. */
export function parseCommissionPercentage(value: unknown): number {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (!raw) return 0;
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(raw)) throw new Error("Informe uma comissão entre 0 e 100%, com até duas casas decimais.");
  const points = Math.round(Number(raw) * 100);
  if (points > 10000) throw new Error("A comissão não pode superar 100%.");
  return points;
}
