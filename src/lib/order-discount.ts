export type DiscountType = "amount" | "percent";

/** Distributes an order discount across net item amounts, preserving every cent. */
export function allocateOrderDiscount(amounts: number[], type: DiscountType, raw: string): number[] {
  const value = raw.trim().replace(",", ".") || "0";
  if (!/^\d+(?:\.\d{0,2})?$/.test(value)) throw new Error("Informe um desconto válido com até duas casas decimais.");
  const units = Math.round(Number(value) * 100);
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  if (!Number.isSafeInteger(units) || !Number.isSafeInteger(total) || amounts.some((amount) => !Number.isSafeInteger(amount) || amount < 0)) throw new Error("Valor de desconto inválido.");
  if (type === "percent" && units > 10000) throw new Error("O desconto percentual não pode ultrapassar 100%.");
  const discount = type === "percent" ? Number((BigInt(total) * BigInt(units) + BigInt(5000)) / BigInt(10000)) : units;
  if (discount > total) throw new Error("O desconto não pode ultrapassar o valor dos itens.");
  if (!total) return amounts.map(() => 0);
  const shares = amounts.map((amount, index) => {
    const numerator = BigInt(amount) * BigInt(discount);
    return { index, cents: Number(numerator / BigInt(total)), remainder: numerator % BigInt(total) };
  });
  let remaining = discount - shares.reduce((sum, share) => sum + share.cents, 0);
  for (const share of [...shares].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)) {
    if (remaining-- > 0) share.cents++;
  }
  return shares.map((share) => share.cents);
}
