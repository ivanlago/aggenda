export type DreEntry = { id: string; type: string; status: string; amountInCents: number; dueDate: string; realizedDate: string | null; categoryId?: string | null };
export type DreAllocation = { id: string; financialEntryId: string; receivedOn: string; grossInCents: number; partnerInCents: number; salonInCents: number; withheldInCents: number; voidedAt: Date | string | null };
export type DreOutflow = { financialEntryId: string; amountInCents: number };

/** Managerial cash basis: receipt date, with due date only for legacy undated entries. */
export function partnershipDre(entries: DreEntry[], allocations: DreAllocation[], outflows: DreOutflow[]) {
  const excludedReceipts = new Map<string, number>();
  const excludedExpenses = new Map<string, number>();
  const issues: string[] = [];
  for (const entry of entries) {
    const parts = allocations.filter(row => row.financialEntryId === entry.id && !row.voidedAt);
    if (entry.type === "receivable" && entry.status === "received" && parts.length) {
      const gross = parts.reduce((sum, row) => sum + row.grossInCents, 0);
      if (gross > entry.amountInCents || parts.some(row => row.receivedOn !== entry.realizedDate || row.grossInCents !== row.partnerInCents + row.salonInCents || row.partnerInCents < 0)) issues.push(entry.id);
      else excludedReceipts.set(entry.id, parts.reduce((sum, row) => sum + row.partnerInCents, 0));
    }
    if (entry.type === "payable" && entry.status === "paid") {
      const links = outflows.filter(row => row.financialEntryId === entry.id);
      if (links.length) {
        if (links.length !== 1 || links[0].amountInCents !== entry.amountInCents) issues.push(entry.id);
        else excludedExpenses.set(entry.id, entry.amountInCents);
      }
    }
  }
  const grossRevenue = entries.filter(row => row.type === "receivable" && row.status === "received").reduce((sum, row) => sum + row.amountInCents, 0);
  const grossExpenses = entries.filter(row => row.type === "payable" && row.status === "paid").reduce((sum, row) => sum + row.amountInCents, 0);
  const partnerShares = [...excludedReceipts.values()].reduce((sum, amount) => sum + amount, 0);
  const partnerOutflows = [...excludedExpenses.values()].reduce((sum, amount) => sum + amount, 0);
  return { grossRevenue, grossExpenses, partnerShares, partnerOutflows, revenue: grossRevenue - partnerShares, expenses: grossExpenses - partnerOutflows, excludedReceipts, excludedExpenses, issues };
}
