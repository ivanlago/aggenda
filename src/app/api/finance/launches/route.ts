import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { financialAccounts, financialCategories, paymentCharges, paymentMethods } from "@/db/schema";
import { chargeListCondition } from "@/lib/charge-list";
import { buildFinancialDownloadExcel, buildFinancialDownloadPdf, type FinancialDownload } from "@/lib/financial-download";
import { launchEntries, loadLaunchEntries, sourceLabels } from "@/lib/financial-launch-entries";
import { financeMonth, nextFinanceMonth } from "@/lib/finance-navigation";
import { loadFinancialStatement } from "@/lib/financial-statement";
import { organizationDate } from "@/lib/organization-time";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export const runtime = "nodejs";

const statusLabels: Record<string, string> = {
  pending: "Pendente", overdue: "Vencido", paid: "Pago", received: "Recebido", cancelled: "Cancelado",
  refunded: "Estornado", payment_review: "Conferência necessária", issuance_failed: "Emissão recusada", partially_refunded: "Estorno parcial",
};

const dayColumn = (label: string) => ({ label, width: 76, kind: "date" as const });
const amountColumn = (label: string) => ({ label, width: 86, kind: "money" as const });
type Context = { id: string; name: string; timezone: string };
type Filters = Record<string, string | undefined>;

async function accountsDownload(organization: Context, query: Filters, today: string, month: string, nextMonth: string, outgoing: boolean): Promise<FinancialDownload> {
  const type = outgoing ? "payable" : "receivable";
  const [allEntries, accounts, categories, methods] = await Promise.all([
    loadLaunchEntries(db, organization.id, type),
    db.select({ id: financialAccounts.id, name: financialAccounts.name }).from(financialAccounts).where(eq(financialAccounts.organizationId, organization.id)),
    db.select({ id: financialCategories.id, name: financialCategories.name }).from(financialCategories).where(eq(financialCategories.organizationId, organization.id)),
    db.select({ id: paymentMethods.id, name: paymentMethods.name }).from(paymentMethods).where(eq(paymentMethods.organizationId, organization.id)),
  ]);
  const names = new Map(accounts.map(item => [item.id, item.name]));
  const categoryNames = new Map(categories.map(item => [item.id, item.name]));
  const methodNames = new Map(methods.map(item => [item.id, item.name]));
  const { entries, received, paid, receivable, payable, overdue } = launchEntries(allEntries, { ...query, tipo: type }, today, month, nextMonth);
  const realized = outgoing ? paid : received;
  const pending = outgoing ? payable : receivable;
  return {
    title: outgoing ? "Contas a pagar" : "Contas a receber",
    organization: organization.name,
    filters: [
      "Período " + month, "Conta " + (names.get(query.conta ?? "") ?? (query.conta && query.conta !== "all" ? "sem correspondência" : "todas")),
      "Categoria " + (categoryNames.get(query.categoria ?? "") ?? (query.categoria && query.categoria !== "all" ? "sem correspondência" : "todas")),
      "Situação " + (query.status && query.status !== "all" ? statusLabels[query.status] ?? "sem correspondência" : "todas"),
      ...(query.dia ? ["Vencimento " + query.dia.slice(0, 10)] : []),
    ],
    summary: [
      { label: outgoing ? "Pagas" : "Recebidas", cents: realized },
      { label: outgoing ? "A pagar" : "A receber", cents: pending },
      { label: "Vencidas", cents: overdue.reduce((total, item) => total + item.amountInCents, 0) },
      { label: "Total do período", cents: realized + pending },
    ],
    columns: [dayColumn("Vencimento"), dayColumn("Data da baixa"), { label: "Descrição", width: 185 }, { label: "Categoria", width: 116 },
      { label: "Conta", width: 80 }, { label: "Forma", width: 86 },
      { label: "Origem", width: 85 }, { label: "Situação", width: 78 }, amountColumn("Valor")],
    rows: entries.map(entry => [entry.dueDate, entry.realizedDate, entry.description, entry.category || null,
      names.get(entry.accountId ?? "") ?? null, entry.paymentMethodName || methodNames.get(entry.paymentMethodId ?? "") || null,
      sourceLabels[entry.source] ?? entry.source,
      entry.status === "pending" && entry.dueDate < today ? "Vencido" : statusLabels[entry.status] ?? entry.status, entry.amountInCents]),
  };
}

async function statementDownload(organization: Context, query: Filters, month: string, nextMonth: string): Promise<FinancialDownload> {
  const { accountNames, initialBalance, balance, rows } = await loadFinancialStatement(db, {
    organizationId: organization.id, timezone: organization.timezone, month, nextMonth, selectedAccount: query.conta,
  });
  return {
    title: "Extrato",
    organization: organization.name,
    filters: ["Período " + month, "Conta " + (accountNames.get(query.conta ?? "") ?? "todas")],
    summary: [{ label: "Saldo anterior", cents: initialBalance }, { label: "Saldo ao fim do período", cents: balance }],
    columns: [dayColumn("Data"), { label: "Descrição", width: 220 }, { label: "Conta", width: 130 }, { label: "Forma", width: 120 }, amountColumn("Valor"), amountColumn("Saldo")],
    rows: rows.map(row => [organizationDate(row.occurredAt, organization.timezone), row.description, accountNames.get(row.accountId) ?? null, row.paymentMethodName, row.amountInCents, row.balance]),
  };
}

async function chargesDownload(organization: Context, query: Filters, today: string): Promise<FinancialDownload> {
  const [charges, methods] = await Promise.all([
    db.select({
      date: paymentCharges.dueDate, client: paymentCharges.customerName, description: paymentCharges.description,
      method: paymentCharges.paymentMethod, provider: paymentCharges.provider, status: paymentCharges.status, amount: paymentCharges.amountInCents,
    }).from(paymentCharges).where(chargeListCondition(organization.id, query, today)).orderBy(desc(paymentCharges.createdAt), desc(paymentCharges.id)),
    db.select({ kind: paymentMethods.kind, name: paymentMethods.name }).from(paymentMethods)
      .where(and(eq(paymentMethods.organizationId, organization.id), eq(paymentMethods.isActive, true))),
  ]);
  const names = new Map(methods.map(method => [method.kind, method.name]));
  return {
    title: "Cobranças online",
    organization: organization.name,
    filters: [
      ...(query.busca ? ["Busca " + query.busca.slice(0, 180)] : []),
      ...(query.cobranca ? ["Cobrança selecionada"] : []),
      ...(query.serie ? ["Cobranças da série"] : []),
      "Vencimento de " + (query.inicio?.slice(0, 10) || "qualquer data") + " até " + (query.fim?.slice(0, 10) || "qualquer data"),
      "Situação " + (statusLabels[query.status ?? ""] ?? "todas"),
      "Meio " + (query.meio && query.meio !== "all" ? names.get(query.meio) ?? query.meio.slice(0, 60) : "todos"),
    ],
    summary: [],
    columns: [dayColumn("Vencimento"), { label: "Cliente", width: 115 }, { label: "Descrição", width: 180 }, { label: "Meio", width: 90 },
      { label: "Provedor", width: 85 }, { label: "Situação", width: 100 }, amountColumn("Valor")],
    rows: charges.map(charge => [charge.date, charge.client, charge.description, names.get(charge.method) ?? charge.method,
      charge.provider, statusLabels[charge.status === "pending" && charge.date < today ? "overdue" : charge.status] ?? charge.status, charge.amount]),
  };
}

export async function GET(request: Request) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.read");
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const format = query.formato;
  if (format !== "pdf" && format !== "xlsx") return new Response("Formato inválido.", { status: 400 });

  const today = organizationDate(new Date(), organization.timezone);
  const month = financeMonth(query.mes, today);
  const nextMonth = nextFinanceMonth(month);
  const isStatement = query.aba === "extrato";
  const outgoing = query.aba === "pagar";
  const isCharges = !isStatement && !outgoing && query.visao === "cobrancas";
  const report = isStatement ? await statementDownload(organization, query, month, nextMonth)
    : isCharges ? await chargesDownload(organization, query, today)
      : await accountsDownload(organization, query, today, month, nextMonth, outgoing);
  const file = format === "pdf" ? await buildFinancialDownloadPdf(report) : await buildFinancialDownloadExcel(report);
  const filename = isStatement ? "extrato" : isCharges ? "cobrancas-online" : outgoing ? "contas-a-pagar" : "contas-a-receber";
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}${isCharges ? "" : "-" + month}.${format}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
