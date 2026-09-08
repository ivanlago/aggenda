export function splitCheckoutTotal(totalInCents: number, procedureInCents: number) {
  if (!Number.isSafeInteger(totalInCents) || !Number.isSafeInteger(procedureInCents) || procedureInCents < 0 || totalInCents < procedureInCents) throw new Error("Totais do pagamento inválidos.");
  return { procedureInCents, additionalInCents: totalInCents - procedureInCents };
}
