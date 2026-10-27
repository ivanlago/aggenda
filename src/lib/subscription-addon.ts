import { addCalendarMonths, commercialQuote, type CommercialSelection } from "./commercial-catalog";

export function signatureAddonQuote(input: CommercialSelection, orderId: string, startedAt: Date, endsAt: Date, now = new Date()) {
  if (!orderId || startedAt > now || endsAt <= now || input.signatures) throw new Error("O adicional requer um plano pago ativo sem assinatura eletrônica incluída.");
  const base = commercialQuote(input);
  const withService = commercialQuote({ ...input, signatures: true });
  const monthlyPriceInCents = (withService.amountInCents - base.amountInCents) / base.months;
  let index = Math.max(0, (now.getUTCFullYear() - startedAt.getUTCFullYear()) * 12 + now.getUTCMonth() - startedAt.getUTCMonth());
  while (index && addCalendarMonths(startedAt, index) > now) index--;
  const firstPeriod = addCalendarMonths(startedAt, index);
  let amount = 0;
  for (let i = index; addCalendarMonths(startedAt, i) < endsAt; i++) {
    const start = addCalendarMonths(startedAt, i), end = addCalendarMonths(startedAt, i + 1);
    const from = Math.max(start.getTime(), now.getTime()), to = Math.min(end.getTime(), endsAt.getTime());
    if (to > from) amount += monthlyPriceInCents * (to - from) / (end.getTime() - start.getTime());
  }
  const firstEnd = new Date(Math.min(addCalendarMonths(startedAt, index + 1).getTime(), endsAt.getTime()));
  const fraction = (firstEnd.getTime() - now.getTime()) / (addCalendarMonths(startedAt, index + 1).getTime() - firstPeriod.getTime());
  return { ...base, kind: "addon" as const, service: "signatures" as const, name: "Assinatura eletrônica — período proporcional", amountInCents: Math.max(1, Math.round(amount)),
    contractOrderId: orderId, contractEndsAt: endsAt.toISOString(), effectiveAt: now.toISOString(), firstPeriod: firstPeriod.toISOString().slice(0,10), initialDocumentLimit: Math.max(1, Math.ceil(50 * fraction)),
    monthlyPriceInCents, renewalAmountInCents: withService.amountInCents, baseSelection: input };
}
