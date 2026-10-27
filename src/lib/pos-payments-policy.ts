import { createHash } from "node:crypto";

export interface MercadoPagoPayment {
  id: number | string; status: string; external_reference?: string; collector_id?: number;
  transaction_amount?: number; transaction_amount_refunded?: number; currency_id?: string; live_mode?: boolean;
  date_approved?: string; date_last_updated?: string; payment_method_id?: string; payment_type_id?: string;
  fee_details?: { type?: string; amount?: number }[];
  transaction_details?: { net_received_amount?: number };
}

export function paymentCents(amount: unknown): number | null {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) && Math.abs(amount * 100 - cents) < 0.0001 ? cents : null;
}

export function verifyPosPayment(payment: MercadoPagoPayment, expected: { chargeId: string; collectorId: string; environment: string; amount: number }) {
  if (payment.external_reference !== `charge:${expected.chargeId}` || String(payment.collector_id) !== expected.collectorId ||
      payment.currency_id !== "BRL" || payment.live_mode !== (expected.environment === "production") || paymentCents(payment.transaction_amount) !== expected.amount) {
    throw new Error("Os dados do pagamento não correspondem à venda e à conta recebedora.");
  }
}

export function posPaymentStatus(payment: MercadoPagoPayment) {
  if (payment.status === "charged_back" || payment.status === "in_mediation") return "payment_review";
  if (payment.status === "refunded") return "refunded";
  if (payment.status === "approved") return (paymentCents(payment.transaction_amount_refunded ?? 0) ?? 0) > 0 ? "partially_refunded" : "paid";
  // A declined attempt does not cancel a reusable Checkout Pro preference.
  return "pending";
}

export function checkoutInputHash(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function checkoutUrlIsSafe(url: string) {
  try { const parsed = new URL(url); return parsed.protocol === "https:" && !parsed.username && !parsed.password &&
    (parsed.hostname === "mercadopago.com.br" || parsed.hostname.endsWith(".mercadopago.com.br")); } catch { return false; }
}
