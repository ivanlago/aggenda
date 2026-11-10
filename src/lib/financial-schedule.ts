export function financialInstallmentAmount(totalInCents: number, count: number, index: number) {
  return Math.floor(totalInCents / count) + (index < totalInCents % count ? 1 : 0);
}

export function financialDueDate(firstDueDate: string, monthOffset: number) {
  const [year, month, day] = firstDueDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next.toISOString().slice(0, 10);
}
