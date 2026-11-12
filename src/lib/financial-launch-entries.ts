import { and, asc, eq } from "drizzle-orm";
import type { db } from "@/db";
import { financialEntries } from "@/db/schema";
import { financePeriod, type FinanceFilters } from "@/lib/finance-view";

export const sourceLabels: Record<string, string> = {
  commission_payment: "Quitação de comissões",
  manual: "Manual",
  appointment: "Agendamento",
  appointment_deposit_direct: "Sinal por Pix direto",
  package: "Pacote",
  installment: "Parcelado",
  recurring: "Recorrente",
  retail_sale: "Venda no PDV",
};

export function loadLaunchEntries(database: typeof db, organizationId: string, type: "receivable" | "payable") {
  return database.select().from(financialEntries).where(and(eq(financialEntries.organizationId, organizationId), eq(financialEntries.type, type)))
    .orderBy(asc(financialEntries.dueDate), asc(financialEntries.id));
}

export function launchEntries(entries: Awaited<ReturnType<typeof loadLaunchEntries>>, filters: FinanceFilters & { lancamento?: string }, today: string, month: string, nextMonth: string) {
  const result = financePeriod(entries, filters, today, month + "-01", nextMonth + "-01");
  result.entries.sort((a, b) => Number(b.id === filters.lancamento) - Number(a.id === filters.lancamento));
  return result;
}
