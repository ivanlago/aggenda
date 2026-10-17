export class CommissionError extends Error {}
export type CommissionBeneficiary = { professionalId: string | null; beneficiaryUserId: string | null };
export type CommissionBeneficiaryOption = { value: string; label: string };
export function beneficiaryKey(value: CommissionBeneficiary) {
  return value.professionalId ? `professional:${value.professionalId}` : value.beneficiaryUserId ? `user:${value.beneficiaryUserId}` : "";
}
export function parseBeneficiary(value: string): CommissionBeneficiary {
  if (value.startsWith("professional:") && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value.slice(13))) return { professionalId: value.slice(13), beneficiaryUserId: null };
  if (value.startsWith("user:") && value.slice(5).length > 0 && value.length <= 205) return { professionalId: null, beneficiaryUserId: value.slice(5) };
  throw new CommissionError("Selecione um beneficiário válido.");
}
export function commissionAmount(base: number, type: string, value: number, quantity = 1) {
  if (![base, value, quantity].every(Number.isSafeInteger) || base < 0 || value < 0 || quantity < 1 || (type === "percentage" && value > 10000)) throw new CommissionError("Base ou regra de comissão inválida.");
  const result = type === "percentage" ? Math.round(base * value / 10000) : type === "fixed" ? value * quantity : value;
  if (!Number.isSafeInteger(result) || result > 2147483647) throw new CommissionError("Comissão fora do limite permitido.");
  return result;
}
// Equal value per package session, preserving every cent across the package.
export function packageSessionBase(price: number, sessions: number, offset: number, quantity: number) {
  if (sessions <= 0 || offset < 0 || quantity < 1 || offset + quantity > sessions) throw new CommissionError("Quantidade de sessões incompatível com o pacote.");
  return Math.floor(price / sessions) * quantity + Math.min(Math.max(price % sessions - offset, 0), quantity);
}
