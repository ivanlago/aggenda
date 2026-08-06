import { and, eq, gte, lt, or } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { financialEntries } from "@/db/schema";
import { organizationDate } from "@/lib/appointment-safety";
import { buildFinancialReportPdf } from "@/lib/financial-report-pdf";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "finance.read");
  const currentMonth = organizationDate(new Date(), organization.timezone).slice(0, 7);
  const requestedMonth = request.nextUrl.searchParams.get("mes") ?? "";
  const month = /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : currentMonth;
  const [year, monthNumber] = month.split("-").map(Number);
  const nextDate = new Date(Date.UTC(year, monthNumber, 1));
  const nextMonth = `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const firstDay = `${month}-01`;
  const nextFirstDay = `${nextMonth}-01`;

  const entries = await db.select({
    dueDate: financialEntries.dueDate,
    realizedDate: financialEntries.realizedDate,
    type: financialEntries.type,
    status: financialEntries.status,
    source: financialEntries.source,
    description: financialEntries.description,
    category: financialEntries.category,
    amountInCents: financialEntries.amountInCents,
  }).from(financialEntries).where(and(
    eq(financialEntries.organizationId, organization.id),
    or(
      and(gte(financialEntries.dueDate, firstDay), lt(financialEntries.dueDate, nextFirstDay)),
      and(gte(financialEntries.realizedDate, firstDay), lt(financialEntries.realizedDate, nextFirstDay))
    )
  )).orderBy(financialEntries.dueDate, financialEntries.createdAt);

  const due = entries.filter((entry) => entry.dueDate >= firstDay && entry.dueDate < nextFirstDay);
  const realized = entries.filter((entry) => entry.realizedDate && entry.realizedDate >= firstDay && entry.realizedDate < nextFirstDay);
  const summary = {
    received: realized.filter((entry) => entry.type === "receivable" && entry.status === "received").reduce((sum, entry) => sum + entry.amountInCents, 0),
    paid: realized.filter((entry) => entry.type === "payable" && entry.status === "paid").reduce((sum, entry) => sum + entry.amountInCents, 0),
    receivable: due.filter((entry) => entry.type === "receivable" && entry.status === "pending").reduce((sum, entry) => sum + entry.amountInCents, 0),
    payable: due.filter((entry) => entry.type === "payable" && entry.status === "pending").reduce((sum, entry) => sum + entry.amountInCents, 0),
  };
  const pdf = await buildFinancialReportPdf({
    organizationName: organization.name,
    month,
    generatedAt: new Date(),
    entries,
    summary,
  });
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="extrato-fluxo-caixa-${month}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
