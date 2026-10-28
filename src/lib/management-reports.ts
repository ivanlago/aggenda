import { z } from "zod";
import { hasOrganizationPermission, type OrganizationPermission, type OrganizationRole } from "./permissions";

export const reportCatalog = [
  { id: "resumo", title: "Resumo gerencial", description: "Vendas, caixa, atendimentos e novos clientes, com comparação ao período anterior.", permissions: ["finance.read", "inventory.read", "appointments.read", "clients.read"] },
  { id: "fluxo", title: "Fluxo de caixa", description: "Entradas e saídas realizadas e previstas, por data financeira.", permissions: ["finance.read"] },
  { id: "contas", title: "Contas a pagar e receber", description: "Vencimentos, pagamentos, recebimentos e atraso das contas.", permissions: ["finance.read"] },
  { id: "vendas", title: "Vendas e orçamentos", description: "Vendas, descontos, cancelamentos e orçamentos emitidos no período.", permissions: ["inventory.read"] },
  { id: "origens", title: "Origem e conversão", description: "Oportunidades criadas no período, agrupadas por origem.", permissions: ["crm.read"] },
  { id: "inativos", title: "Clientes inativos", description: "Clientes sem atendimento concluído há 30, 60, 90 ou 180 dias na data de referência.", permissions: ["clients.manage", "crm.read", "appointments.read"] },
] as const satisfies readonly { id: string; title: string; description: string; permissions: readonly OrganizationPermission[] }[];
export type ReportId = typeof reportCatalog[number]["id"];
export type ReportColumn = { title: string; kind?: "money" | "date" | "percent" | "number"; width?: number };
export type ReportCell = string | number | null;
export type ReportTable = { title: string; columns: ReportColumn[]; rows: ReportCell[][] };
export type ManagementReport = { title: string; organization: string; timezone?: string; generatedAt: string; filters: string[]; notes: string[]; tables: ReportTable[] };
export type ReportFilters = ReturnType<typeof parseReportFilters>;

export function canReadReport(role: OrganizationRole, id: ReportId) {
  return reportCatalog.find(item => item.id === id)!.permissions.every(permission => hasOrganizationPermission(role, permission));
}
export function shiftReportDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function parseReportFilters(input: Record<string, unknown>, today: string) {
  const id = z.enum(["resumo", "fluxo", "contas", "vendas", "origens", "inativos"]).parse(input.relatorio ?? "resumo");
  const to = z.iso.date().parse(input.ate ?? today);
  const from = z.iso.date().parse(id === "inativos" ? to : input.de ?? `${today.slice(0, 7)}-01`);
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (days < 1 || days > 366) throw new Error("Escolha um período entre 1 e 366 dias, com início anterior ou igual ao fim.");
  const inactiveDays = z.enum(["30", "60", "90", "180"]).parse(input.inatividade ?? "90");
  const search = z.string().trim().max(120).parse(input.busca ?? "");
  const status = z.enum(["all", "pending", "received", "paid", "cancelled"]).parse(input.situacao ?? "all");
  const uuid = (value: unknown) => value ? z.uuid().parse(value) : undefined;
  return { id, from, to, days, inactiveDays: Number(inactiveDays), search, status, account: uuid(input.conta), category: uuid(input.categoria), costCenter: uuid(input.centro) };
}
export function reportQuery(filters: ReportFilters) {
  return new URLSearchParams({ relatorio: filters.id, de: filters.from, ate: filters.to, inatividade: String(filters.inactiveDays), busca: filters.search, situacao: filters.status, ...(filters.account ? { conta: filters.account } : {}), ...(filters.category ? { categoria: filters.category } : {}), ...(filters.costCenter ? { centro: filters.costCenter } : {}) });
}
export function formatReportCell(value: ReportCell, column: ReportColumn) {
  if (value === null || value === "") return "—";
  if (column.kind === "money") return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (column.kind === "percent") return `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  if (column.kind === "date") return String(value).slice(0, 10).split("-").reverse().join("/");
  return typeof value === "number" ? value.toLocaleString("pt-BR") : value;
}
export const financialStatusLabel: Record<string, string> = { pending: "Pendente", received: "Recebido", paid: "Pago", cancelled: "Cancelado" };
