import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { organizationDate, zonedDate } from "./organization-time";
import { canReadReport, financialStatusLabel, reportCatalog, shiftReportDate, type ManagementReport, type ReportFilters } from "./management-reports";
import type { OrganizationRole } from "./permissions";

type Organization = { id: string; name: string; timezone: string; role: OrganizationRole };
async function query<T extends Record<string, unknown>>(statement: SQL) { return (await db.execute(statement)).rows as T[]; }
const money = (value: unknown) => Number(value ?? 0) / 100;
const numeric = (value: unknown) => Number(value ?? 0);
const text = (value: unknown) => value == null ? null : String(value);

export async function loadManagementReport(organization: Organization, filters: ReportFilters): Promise<ManagementReport> {
  // Also enforced here so neither an export nor a future caller can bypass the page.
  if (!canReadReport(organization.role, filters.id)) throw new Error("Sem permissão para este relatório.");
  const { id: org, timezone } = organization;
  const start = zonedDate(filters.from, "00:00", timezone);
  const end = zonedDate(shiftReportDate(filters.to, 1), "00:00", timezone);
  const report: ManagementReport = { title: reportCatalog.find(item => item.id === filters.id)!.title, organization: organization.name, timezone, generatedAt: new Date().toISOString(), filters: [filters.id === "inativos" ? `Data de referência: ${filters.to}` : `Período: ${filters.from} a ${filters.to}`, `Fuso horário: ${timezone}`], notes: [], tables: [] };
  const search = `%${filters.search}%`;
  const localToday = organizationDate(new Date(), timezone);

  if (filters.id === "resumo") {
    async function totals(from: string, to: string) {
      const first = zonedDate(from, "00:00", timezone), last = zonedDate(to, "00:00", timezone);
      const [finance, sales, attendance, clients] = await Promise.all([
        query(sql`SELECT coalesce(sum(amount_in_cents) FILTER (WHERE status='received' AND type='receivable'),0) AS received, coalesce(sum(amount_in_cents) FILTER (WHERE status='paid' AND type='payable'),0) AS paid FROM financial_entries WHERE organization_id=${org} AND realized_date >= ${from} AND realized_date < ${to}`),
        query(sql`SELECT coalesce(sum(total_in_cents),0) AS total, count(*) AS quantity FROM retail_sales WHERE organization_id=${org} AND status='completed' AND sold_at >= ${first} AND sold_at < ${last}`),
        query(sql`SELECT count(*) AS quantity FROM appointments WHERE organization_id=${org} AND status='completed' AND starts_at >= ${first} AND starts_at < ${last}`),
        query(sql`SELECT count(*) AS quantity FROM clients WHERE organization_id=${org} AND created_at >= ${first} AND created_at < ${last}`),
      ]);
      return [money(sales[0].total), money(finance[0].received), money(finance[0].paid), money(numeric(finance[0].received) - numeric(finance[0].paid)), numeric(sales[0].quantity), numeric(attendance[0].quantity), numeric(clients[0].quantity)];
    }
    const previousFrom = shiftReportDate(filters.from, -filters.days);
    const [current, previous] = await Promise.all([totals(filters.from, shiftReportDate(filters.to, 1)), totals(previousFrom, filters.from)]);
    report.filters.push(`Comparação: ${previousFrom} a ${shiftReportDate(filters.from, -1)}`);
    const names = ["Vendas concluídas (R$)", "Recebimentos (R$)", "Despesas pagas (R$)", "Movimento líquido de caixa (R$)", "Vendas concluídas (quantidade)", "Atendimentos concluídos", "Novos cadastros de clientes"];
    // Separate monetary metrics from counts to preserve Excel cell types and formatting.
    for (const [from, to, title, kind] of [[0, 4, "Valores financeiros", "money"], [4, 7, "Atividade", "number"]] as const) {
      report.tables.push({ title, columns: [{ title: "Indicador" }, { title: "Período", kind }, { title: "Anterior", kind }, { title: "Diferença", kind }], rows: names.slice(from, to).map((name, index) => [name, current[from + index], previous[from + index], current[from + index] - previous[from + index]]) });
    }
    report.notes.push("Vendas usam a data da venda; recebimentos e despesas usam a data de realização; atendimentos usam a data agendada; novos cadastros usam a data de cadastro.", "Movimento líquido é recebimentos menos despesas pagas no período; não representa saldo bancário nem lucro. Vendas e recebimentos são medidas distintas e não são somados.");
  } else if (filters.id === "fluxo" || filters.id === "contas") {
    const financeDate = filters.id === "fluxo" ? sql`CASE WHEN f.status IN ('received','paid') THEN f.realized_date ELSE f.due_date END` : sql`f.due_date`;
    const constraints = [sql`f.organization_id=${org}`, sql`${financeDate} >= ${filters.from}`, sql`${financeDate} <= ${filters.to}`];
    if (filters.id === "fluxo") constraints.push(sql`f.status IN ('pending','received','paid')`);
    if (filters.status !== "all") constraints.push(sql`f.status=${filters.status}`);
    if (filters.account) constraints.push(sql`f.account_id=${filters.account}`);
    if (filters.category) constraints.push(sql`f.category_id=${filters.category}`);
    if (filters.costCenter) constraints.push(sql`f.cost_center_id=${filters.costCenter}`);
    if (filters.search) constraints.push(sql`(f.description ILIKE ${search} OR c.name ILIKE ${search})`);
    const [rows, options] = await Promise.all([
      query(sql`SELECT f.description, f.type, f.status, f.due_date::text AS due, f.realized_date::text AS realized, ${financeDate}::text AS date, f.amount_in_cents AS amount, coalesce(c.name,'Sem cliente') AS client, coalesce(a.name,'Sem conta') AS account, coalesce(cat.name,f.category,'Sem categoria') AS category, coalesce(cc.name,'Sem centro de custo') AS center FROM financial_entries f LEFT JOIN clients c ON c.id=f.client_id AND c.organization_id=${org} LEFT JOIN financial_accounts a ON a.id=f.account_id AND a.organization_id=${org} LEFT JOIN financial_categories cat ON cat.id=f.category_id AND cat.organization_id=${org} LEFT JOIN financial_cost_centers cc ON cc.id=f.cost_center_id AND cc.organization_id=${org} WHERE ${sql.join(constraints, sql` AND `)} ORDER BY ${financeDate}, f.id`),
      filters.account || filters.category || filters.costCenter ? reportFinanceOptions(org) : Promise.resolve(null),
    ]);
    report.filters.push(`Situação: ${financialStatusLabel[filters.status] ?? "Todas"}`);
    for (const [label, field, choices] of [["Conta", "account", options?.accounts], ["Categoria", "category", options?.categories], ["Centro de custo", "costCenter", options?.centers]] as const) {
      if (filters[field]) report.filters.push(`${label}: ${choices?.find(choice => choice.id === filters[field])?.name ?? "Opção não encontrada"}`);
    }
    if (filters.search) report.filters.push(`Busca por descrição ou cliente: ${filters.search}`);
    const sum = (type: string, status: string) => rows.filter(row => row.type === type && row.status === status).reduce((total, row) => total + money(row.amount), 0);
    report.tables.push({ title: "Totais do filtro", columns: [{ title: "Indicador" }, { title: "Valor", kind: "money" }], rows: [["Recebido", sum("receivable", "received")], ["Pago", sum("payable", "paid")], ["A receber", sum("receivable", "pending")], ["A pagar", sum("payable", "pending")], ["Movimento líquido realizado", sum("receivable", "received") - sum("payable", "paid")]] });
    if (filters.id === "fluxo") {
      const days = [...new Set(rows.map(row => String(row.date)))];
      report.tables.push({ title: "Movimentação por dia", columns: [{ title: "Data", kind: "date" }, { title: "Entradas realizadas", kind: "money" }, { title: "Saídas realizadas", kind: "money" }, { title: "Entradas previstas", kind: "money" }, { title: "Saídas previstas", kind: "money" }], rows: days.map(day => { const dayRows = rows.filter(row => row.date === day); return [day, ...[["receivable", "received"], ["payable", "paid"], ["receivable", "pending"], ["payable", "pending"]].map(([type, status]) => dayRows.filter(row => row.type === type && row.status === status).reduce((total, row) => total + money(row.amount), 0))]; }) });
    }
    const today = localToday;
    if (filters.id === "contas") {
      const ranges = [["No prazo", -Infinity, 0], ["1 a 30 dias", 1, 30], ["31 a 60 dias", 31, 60], ["61 a 90 dias", 61, 90], ["Mais de 90 dias", 91, Infinity]] as const;
      report.tables.push({ title: "Pendências por faixa de atraso atual", columns: [{ title: "Faixa" }, { title: "A receber", kind: "money" }, { title: "A pagar", kind: "money" }], rows: ranges.map(([label, min, max]) => [label, ...["receivable", "payable"].map(type => rows.filter(row => {
        const days = Math.floor((Date.parse(today) - Date.parse(String(row.due))) / 86400000);
        return row.status === "pending" && row.type === type && days >= min && days <= max;
      }).reduce((sum, row) => sum + money(row.amount), 0))]) });
    }
    report.tables.push({ title: "Lançamentos", columns: [{ title: "Descrição / cliente", width: 2 }, { title: "Tipo / situação" }, { title: "Vencimento", kind: "date" }, { title: "Realização", kind: "date" }, { title: "Valor", kind: "money" }, { title: "Conta / categoria / centro", width: 2 }, ...(filters.id === "contas" ? [{ title: "Atraso atual (dias)", kind: "number" as const }] : [])], rows: rows.map(row => [`${row.description} / ${row.client}`, `${row.type === "receivable" ? "A receber" : "A pagar"} / ${financialStatusLabel[String(row.status)] ?? row.status}`, text(row.due), text(row.realized), money(row.amount), `${row.account} / ${row.category} / ${row.center}`, ...(filters.id === "contas" ? [row.status === "pending" ? Math.max(0, Math.floor((Date.parse(today) - Date.parse(String(row.due))) / 86400000)) : 0] : [])]) });
    report.notes.push(filters.id === "fluxo" ? "Realizado por data de realização; previsto por vencimento. Contas realizadas sem data de realização não integram o fluxo. Cancelados são excluídos. Não inclui saldo inicial das contas." : `Filtro por vencimento. A situação e o atraso refletem a posição atual em ${today}, não uma reconstrução histórica. Contas canceladas não compõem os totais.`, "Os valores previstos podem mudar com pagamentos, cancelamentos ou alterações posteriores.");
  } else if (filters.id === "vendas") {
    const [sales, quotes, items] = await Promise.all([
      query(sql`SELECT s.id, (s.sold_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date::text AS date, coalesce(c.name,'Sem cliente') AS client, s.status, s.subtotal_in_cents AS subtotal, s.discount_in_cents AS discount, s.total_in_cents AS total FROM retail_sales s LEFT JOIN clients c ON c.id=s.client_id AND c.organization_id=${org} WHERE s.organization_id=${org} AND s.sold_at >= ${start} AND s.sold_at < ${end} ORDER BY s.sold_at,s.id`),
      query(sql`SELECT (q.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date::text AS date, coalesce(c.name,q.client_name,'Sem cliente') AS client, q.total_in_cents AS total, q.valid_until::text AS validity, CASE WHEN q.sale_id IS NOT NULL THEN 'Convertido' WHEN q.valid_until < ${localToday} THEN 'Vencido' ELSE 'Pendente' END AS status FROM retail_quotes q LEFT JOIN clients c ON c.id=q.client_id AND c.organization_id=${org} WHERE q.organization_id=${org} AND q.created_at >= ${start} AND q.created_at < ${end} ORDER BY q.created_at,q.id`),
      query(sql`SELECT i.product_name AS name, CASE WHEN i.package_id IS NOT NULL THEN 'Pacote' WHEN i.service_id IS NOT NULL THEN 'Procedimento' ELSE 'Produto' END AS kind, sum(i.quantity) AS quantity, sum(i.total_in_cents) AS total FROM retail_sale_items i INNER JOIN retail_sales s ON s.id=i.sale_id AND s.organization_id=${org} WHERE i.organization_id=${org} AND s.status='completed' AND s.sold_at >= ${start} AND s.sold_at < ${end} GROUP BY i.product_name,kind ORDER BY total DESC,i.product_name`),
    ]);
    const completed = sales.filter(row => row.status === "completed");
    report.tables.push({ title: "Resumo das vendas", columns: [{ title: "Indicador" }, { title: "Valor", kind: "money" }], rows: [["Vendas concluídas", completed.reduce((sum, row) => sum + money(row.total), 0)], ["Descontos nas vendas concluídas", completed.reduce((sum, row) => sum + money(row.discount), 0)]] });
    report.tables.push({ title: "Vendas por item (concluídas)", columns: [{ title: "Item", width: 2 }, { title: "Tipo" }, { title: "Quantidade", kind: "number" }, { title: "Valor dos itens", kind: "money" }], rows: items.map(row => [text(row.name), text(row.kind), numeric(row.quantity), money(row.total)]) });
    report.tables.push({ title: "Vendas", columns: [{ title: "Data", kind: "date" }, { title: "Cliente", width: 2 }, { title: "Situação" }, { title: "Desconto", kind: "money" }, { title: "Total", kind: "money" }], rows: sales.map(row => [text(row.date), text(row.client), ({ completed: "Concluída", cancelled: "Cancelada", pending_payment: "Aguardando pagamento", refunded: "Estornada" } as Record<string,string>)[String(row.status)] ?? String(row.status), money(row.discount), money(row.total)]) });
    report.tables.push({ title: "Orçamentos emitidos", columns: [{ title: "Emissão", kind: "date" }, { title: "Cliente", width: 2 }, { title: "Situação" }, { title: "Validade", kind: "date" }, { title: "Total", kind: "money" }], rows: quotes.map(row => [text(row.date), text(row.client), text(row.status), text(row.validity), money(row.total)]) });
    report.notes.push("Vendas selecionadas pela data da venda e orçamentos pela emissão; situações refletem a posição atual. Orçamentos e vendas não são somados. Apenas vendas concluídas integram os totais.", "Totais por item podem diferir do total da venda devido a descontos aplicados ao pedido. Este relatório não comprova recebimento financeiro.");
  } else if (filters.id === "origens") {
    const rows = await query(sql`SELECT coalesce(nullif(trim(source),''),'Não informada') AS source, count(*) AS total, count(*) FILTER (WHERE status='won') AS won, count(*) FILTER (WHERE status='lost') AS lost, count(*) FILTER (WHERE status='open') AS opened, coalesce(sum(value_in_cents) FILTER (WHERE status='won'),0) AS value FROM crm_opportunities WHERE organization_id=${org} AND created_at >= ${start} AND created_at < ${end} GROUP BY coalesce(nullif(trim(source),''),'Não informada') ORDER BY total DESC,source`);
    report.tables.push({ title: "Desempenho por origem", columns: [{ title: "Origem", width: 2 }, { title: "Criadas", kind: "number" }, { title: "Abertas", kind: "number" }, { title: "Ganhas", kind: "number" }, { title: "Perdidas", kind: "number" }, { title: "Conversão entre encerradas", kind: "percent" }, { title: "Valor ganho", kind: "money" }], rows: rows.map(row => [text(row.source), numeric(row.total), numeric(row.opened), numeric(row.won), numeric(row.lost), numeric(row.won) + numeric(row.lost) ? numeric(row.won) / (numeric(row.won) + numeric(row.lost)) * 100 : null, money(row.value)]) });
    report.notes.push("Coorte de oportunidades criadas no período, com situação atual. Conversão = ganhas / (ganhas + perdidas); sem encerramentos, a taxa fica sem valor.", "Valor ganho é o valor informado nas oportunidades ganhas, não receita recebida nem atribuição comprovada a campanhas.");
  } else {
    const cutoff = zonedDate(shiftReportDate(filters.to, -filters.inactiveDays + 1), "00:00", timezone);
    const rows = await query(sql`SELECT c.name, c.phone, c.email, (a.last_visit AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date::text AS last_visit, (SELECT (min(n.starts_at) AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date::text FROM appointments n WHERE n.organization_id=${org} AND n.client_id=c.id AND n.status IN ('scheduled','confirmed') AND n.starts_at >= ${end}) AS next_visit FROM clients c INNER JOIN (SELECT client_id,max(starts_at) AS last_visit FROM appointments WHERE organization_id=${org} AND status='completed' AND starts_at < ${end} GROUP BY client_id) a ON a.client_id=c.id WHERE c.organization_id=${org} AND a.last_visit < ${cutoff} AND (c.name ILIKE ${search} OR coalesce(c.phone,'') ILIKE ${search}) ORDER BY a.last_visit,c.id`);
    report.filters.push(`Inatividade: ao menos ${filters.inactiveDays} dias`, ...(filters.search ? [`Busca por nome ou telefone: ${filters.search}`] : []));
    report.tables.push({ title: "Clientes para avaliação de recuperação", columns: [{ title: "Cliente", width: 2 }, { title: "Telefone" }, { title: "E-mail", width: 2 }, { title: "Último atendimento", kind: "date" }, { title: "Dias sem atendimento", kind: "number" }, { title: "Próximo agendamento", kind: "date" }], rows: rows.map(row => [text(row.name), text(row.phone), text(row.email), text(row.last_visit), Math.round((Date.parse(filters.to) - Date.parse(String(row.last_visit))) / 86400000), text(row.next_visit)]) });
    report.notes.push("Considera o último atendimento concluído até a data de referência. Clientes sem nenhum atendimento concluído não são classificados como inativos.", "O próximo agendamento é o primeiro agendamento atualmente marcado ou confirmado após a data de referência. A lista não dispara mensagens e não inclui prontuário.");
  }
  return report;
}

export async function reportFinanceOptions(organizationId: string) {
  const [accounts, categories, centers] = await Promise.all([
    query(sql`SELECT id,name FROM financial_accounts WHERE organization_id=${organizationId} ORDER BY name`),
    query(sql`SELECT id,name FROM financial_categories WHERE organization_id=${organizationId} ORDER BY name`),
    query(sql`SELECT id,name FROM financial_cost_centers WHERE organization_id=${organizationId} ORDER BY name`),
  ]);
  return { accounts, categories, centers };
}
