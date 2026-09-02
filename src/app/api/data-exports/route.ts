import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { clients, services } from "@/db/schema";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export async function GET(request: Request) {
  const { organization } = await requireOrganization();
  const url = new URL(request.url);
  const type = url.searchParams.get("type") === "services" ? "services" : "clients";
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const template = url.searchParams.get("template") === "1";
  assertOrganizationPermission(organization.role, type === "clients" ? "clients.manage" : "services.read");

  const headers = type === "clients"
    ? ["nome", "telefone", "email", "data_nascimento", "sexo", "observacoes"]
    : ["nome", "descricao", "duracao_minutos", "preco", "ativo", "exige_profissional"];
  let rows: Array<Array<string | number | null>> = [];
  if (template) {
    rows = type === "clients"
      ? [["Maria Silva", "(71) 99999-9999", "maria@email.com", "1990-05-20", "feminino", "Exemplo — apague esta linha"]]
      : [["Avaliação", "Avaliação inicial", 30, "50,00", "sim", "sim"]];
  } else if (type === "clients") {
    const data = await db.select().from(clients).where(eq(clients.organizationId, organization.id));
    rows = data.map((item) => [item.name, item.phone, item.email, item.birthDate, item.gender, item.notes]);
  } else {
    const data = await db.select().from(services).where(eq(services.organizationId, organization.id));
    rows = data.map((item) => [item.name, item.description, item.durationMinutes, item.priceInCents == null ? null : (item.priceInCents / 100).toFixed(2), item.isActive ? "sim" : "não", item.requiresProfessional ? "sim" : "não"]);
  }
  const baseName = `${type === "clients" ? "clientes" : "servicos"}-${template ? "modelo" : "aggenda"}`;
  if (format === "csv") {
    const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${baseName}.csv"` } });
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(type === "clients" ? "Clientes" : "Serviços", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.addRow(headers); rows.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF18664A" } };
  sheet.columns.forEach((column) => { column.width = Math.min(40, Math.max(14, ...(column.values ?? []).map((value) => String(value ?? "").length + 2))); });
  sheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + headers.length)}1` };
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${baseName}.xlsx"` } });
}
