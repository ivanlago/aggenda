import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PaginatedCollection } from "@/components/paginated-collection";
import { requireOrganization } from "@/lib/session";
import { organizationDate } from "@/lib/organization-time";
import { canReadReport, financialStatusLabel, formatReportCell, parseReportFilters, reportCatalog, reportQuery } from "@/lib/management-reports";
import { loadManagementReport, reportFinanceOptions } from "@/lib/management-report-data";

export const metadata = { title: "Relatórios" };
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { organization } = await requireOrganization();
  const query = await searchParams;
  const available = reportCatalog.filter(item => canReadReport(organization.role, item.id));
  const today = organizationDate(new Date(), organization.timezone);
  let filters;
  try { filters = parseReportFilters({ ...query, relatorio: query.relatorio ?? available[0]?.id }, today); }
  catch { return <div className="page-wrap"><PageHeader eyebrow="Gestão e marketing" title="Relatórios" description="Consulte e exporte os dados do negócio." /><p role="alert" className="panel">Filtros inválidos. Escolha datas válidas e um período de até 366 dias.</p><Link className="secondary-button mt-4" href="/relatorios">Recomeçar</Link></div>; }
  if (!available.length || !canReadReport(organization.role, filters.id)) return <div className="page-wrap"><PageHeader eyebrow="Gestão e marketing" title="Relatórios" description="Você não tem permissão para este relatório." /><Link className="secondary-button" href={available.length ? "/relatorios" : "/dashboard"}>{available.length ? "Ver relatórios disponíveis" : "Voltar ao Dashboard"}</Link></div>;
  const finance = filters.id === "fluxo" || filters.id === "contas";
  const [report, options] = await Promise.all([loadManagementReport(organization, filters), finance ? reportFinanceOptions(organization.id) : Promise.resolve(null)]);
  const params = reportQuery(filters).toString();
  return <div className="page-wrap min-w-0">
    <PageHeader eyebrow="Gestão e marketing" title="Relatórios" description="Consulte os resultados na tela e emita documentos em PDF ou planilhas Excel." />
    <nav aria-label="Tipos de relatório" className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{available.map(item => <Link key={item.id} href={`/relatorios?relatorio=${item.id}&de=${filters.from}&ate=${filters.to}`} aria-current={filters.id === item.id ? "page" : undefined} className={`rounded-xl border p-4 ${filters.id === item.id ? "border-brand bg-brand/5" : "bg-white"}`}><span className="font-extrabold text-brand">{item.title}</span><span className="mt-1 block text-sm text-muted">{item.description}</span></Link>)}</nav>
    <form key={params} className="panel mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" method="get">
      <input type="hidden" name="relatorio" value={filters.id} />
      {filters.id !== "inativos" && <label className="grid gap-2 text-sm font-bold">De<input className="field" name="de" type="date" required defaultValue={filters.from} /></label>}
      <label className="grid gap-2 text-sm font-bold">{filters.id === "inativos" ? "Data de referência" : "Até"}<input className="field" name="ate" type="date" required defaultValue={filters.to} /></label>
      {filters.id === "inativos" && <><input type="hidden" name="de" value={filters.to} /><label className="grid gap-2 text-sm font-bold">Dias sem atendimento<select className="field" name="inatividade" defaultValue={filters.inactiveDays}>{[30, 60, 90, 180].map(days => <option key={days} value={days}>{days} dias ou mais</option>)}</select></label></>}
      {(finance || filters.id === "inativos") && <label className="grid gap-2 text-sm font-bold">{finance ? "Descrição ou cliente" : "Nome ou telefone"}<input className="field" name="busca" maxLength={120} defaultValue={filters.search} type="search" /></label>}
      {finance && <label className="grid gap-2 text-sm font-bold">Situação<select className="field" name="situacao" defaultValue={filters.status}><option value="all">Todas</option>{Object.entries(financialStatusLabel).filter(([key]) => filters.id !== "fluxo" || key !== "cancelled").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
      {options && ([['Conta', 'conta', options.accounts, filters.account], ['Categoria', 'categoria', options.categories, filters.category], ['Centro de custo', 'centro', options.centers, filters.costCenter]] as const).map(([label, name, rows, selected]) => <label key={name} className="grid gap-2 text-sm font-bold">{label}<select name={name} className="field" defaultValue={selected ?? ""}><option value="">Todas as opções</option>{rows.map(row => <option key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>)}</select></label>)}
      <div className="flex flex-wrap items-end gap-2 sm:col-span-2 xl:col-span-4"><button className="primary-button">Consultar</button><Link className="secondary-button" href={`/relatorios?relatorio=${filters.id}`}>Limpar filtros</Link></div>
    </form>
    <section className="panel min-w-0" aria-labelledby="report-title">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="report-title" className="text-xl font-extrabold">{report.title}</h2><p className="mt-1 text-sm text-muted">{report.organization} · Emitido em {new Date(report.generatedAt).toLocaleString("pt-BR", { timeZone: organization.timezone })}</p></div><div className="flex flex-wrap gap-2"><a className="secondary-button" href={`/api/reports?${params}&formato=pdf`}>Exportar PDF</a><a className="secondary-button" href={`/api/reports?${params}&formato=xlsx`}>Exportar Excel</a></div></div>
      <ul className="mt-4 grid gap-1 text-sm text-muted">{report.filters.map(item => <li key={item}>{item}</li>)}</ul>
      <div className="mt-4 rounded-xl bg-brand/5 p-4 text-sm"><p className="font-bold">Como interpretar</p><ul className="mt-2 grid gap-2">{report.notes.map(item => <li key={item}>{item}</li>)}</ul></div>
      <p className="mt-4 text-sm text-muted">As exportações incluem todos os registros dos filtros consultados. Os dados refletem a posição no momento de cada emissão.</p>
      {report.tables.map((table, index) => <section key={index} className="mt-6 min-w-0"><h3 className="mb-3 font-extrabold">{table.title} ({table.rows.length})</h3>{!table.rows.length ? <p className="empty-state">Nenhum registro encontrado para os filtros.</p> : <div className="max-h-[40rem] overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-white text-left"><tr>{table.columns.map((column, columnIndex) => <th scope="col" key={columnIndex} className="border-b p-3">{column.title}</th>)}</tr></thead><PaginatedCollection key={`${params}-${index}`} as="tbody" label={table.title} className="divide-y">{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className={`p-3 ${table.columns[cellIndex].kind ? "whitespace-nowrap" : "min-w-36 break-words"}`}>{formatReportCell(cell, table.columns[cellIndex])}</td>)}</tr>)}</PaginatedCollection></table></div>}</section>)}
    </section>
  </div>;
}
