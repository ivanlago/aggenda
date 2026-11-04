export function parseHundredths(input: string): number | null {
  const match = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

export function calculateFiscalShare(amountInCents: number, percentageBasisPoints: number) {
  if (!Number.isSafeInteger(amountInCents) || amountInCents < 0 || amountInCents > 99_999_999_999 ||
      !Number.isInteger(percentageBasisPoints) || percentageBasisPoints < 0 || percentageBasisPoints > 10_000) {
    return null;
  }
  const professional = Math.floor((amountInCents * percentageBasisPoints + 5_000) / 10_000);
  return { professional, salon: amountInCents - professional };
}
