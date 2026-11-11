import { financialDueDate, financialInstallmentAmount } from "./financial-schedule";

export function boletoSchedule(amount: number, count: number, firstDue: string, today: string) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 60 || !Number.isSafeInteger(amount) || amount < count) throw new Error("Revise a quantidade e o valor das parcelas do boleto.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDue) || !Number.isFinite(Date.parse(firstDue)) || new Date(`${firstDue}T12:00:00Z`).toISOString().slice(0,10) !== firstDue || firstDue < today) throw new Error("Informe um primeiro vencimento válido, a partir de hoje.");
  return Array.from({ length: count }, (_, index) => ({ amountInCents: financialInstallmentAmount(amount, count, index), dueDate: financialDueDate(firstDue, index), installmentNumber: index + 1, installmentCount: count }));
}

// Mercado Pago allows an offline payment due date within 30 days of issuance.
// Keep a one-day margin because provider validation uses timestamps.
export function boletoAvailableFrom(dueDate: string) {
  return new Date(Date.parse(`${dueDate}T12:00:00Z`) - 29 * 86400000).toISOString().slice(0,10);
}

export function isCreditCharge(charge: { metadata: Record<string, unknown> | null }) {
  return charge.metadata?.saleOnCredit === true;
}
