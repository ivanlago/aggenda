export type FinanceFilters = { status?: string; tipo?: string; conta?: string; categoria?: string };
type Entry = { status: string; type: string; dueDate: string; realizedDate: string | null; accountId: string | null; categoryId: string | null; amountInCents: number };

export function matchesFinanceFilters(entry: Entry, filters: FinanceFilters, today: string) {
  return (!filters.status || filters.status === "all" || (filters.status === "overdue" ? entry.status === "pending" && entry.dueDate < today : entry.status === filters.status))
    && (!filters.tipo || filters.tipo === "all" || entry.type === filters.tipo)
    && (!filters.conta || filters.conta === "all" || entry.accountId === filters.conta)
    && (!filters.categoria || filters.categoria === "all" || entry.categoryId === filters.categoria);
}

export function financePeriod<T extends Entry>(entries: T[], filters: FinanceFilters, today: string, firstDay: string, nextFirstDay: string) {
  const scoped = entries.filter((entry) => matchesFinanceFilters(entry, filters, today));
  const inPeriod = (date: string | null) => Boolean(date && date >= firstDay && date < nextFirstDay);
  const rows = scoped.filter((entry) => inPeriod(entry.dueDate) || inPeriod(entry.realizedDate));
  const total = (type: string, status: string, by: "dueDate" | "realizedDate") => scoped
    .filter((entry) => entry.type === type && entry.status === status && inPeriod(entry[by]))
    .reduce((sum, entry) => sum + entry.amountInCents, 0);
  return { entries: rows, received: total("receivable", "received", "realizedDate"), paid: total("payable", "paid", "realizedDate"), receivable: total("receivable", "pending", "dueDate"), payable: total("payable", "pending", "dueDate"), overdue: rows.filter((entry) => entry.status === "pending" && entry.dueDate < today) };
}

// Confirmed and unsettled online charges must be managed through their provider.
export const managedChargeStatuses = ["pending", "overdue", "paid", "payment_review", "partially_refunded"];
export const isManagedCharge = (status: string) => managedChargeStatuses.includes(status);
