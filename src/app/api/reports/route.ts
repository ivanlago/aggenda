import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/session";
import { organizationDate } from "@/lib/organization-time";
import { canReadReport, parseReportFilters } from "@/lib/management-reports";
import { loadManagementReport } from "@/lib/management-report-data";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const { organization } = await requireOrganization();
  const url = new URL(request.url);
  let filters;
  try { filters = parseReportFilters(Object.fromEntries(url.searchParams), organizationDate(new Date(), organization.timezone)); }
  catch { return NextResponse.json({ error: "Filtros inválidos. Revise o período e as opções do relatório." }, { status: 400 }); }
  if (!canReadReport(organization.role, filters.id)) return NextResponse.json({ error: "Sem permissão para este relatório." }, { status: 403 });
  const format = url.searchParams.get("formato");
  if (format !== "pdf" && format !== "xlsx") return NextResponse.json({ error: "Escolha PDF ou Excel." }, { status: 400 });
  const report = await loadManagementReport(organization, filters);
  const { managementReportExcel, managementReportPdf } = await import("@/lib/management-report-export");
  const bytes = format === "pdf" ? await managementReportPdf(report) : await managementReportExcel(report);
  return new Response(new Uint8Array(bytes), { headers: {
    "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="aggenda-${filters.id}-${filters.from}-${filters.to}.${format}"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}
