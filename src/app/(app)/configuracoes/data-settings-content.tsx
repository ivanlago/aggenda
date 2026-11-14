import { ListPagination } from "@/components/list-pagination";
import { parseListPage, parseListPageSize } from "@/lib/list-pagination";
import { desc, eq } from "drizzle-orm";
import { Download, RotateCcw, Upload } from "lucide-react";

import { undoDataImport } from "@/actions/data-imports";
import { DataImporter } from "@/components/data-importer";
import { db } from "@/db";
import { dataImports } from "@/db/schema";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";


export async function DataSettingsContent({ query }: { query: { pagina?: string; linhas?: string } }) {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "clients.manage", organization.teamPermissionOverrides);
  const pageSize = parseListPageSize(query.linhas);
  const condition = eq(dataImports.organizationId, organization.id);
  const total = await db.$count(dataImports, condition);
  const page = Math.min(parseListPage(query.pagina), Math.max(1, Math.ceil(total / pageSize)));
  const history = await db.select().from(dataImports).where(condition).orderBy(desc(dataImports.createdAt), desc(dataImports.id)).limit(pageSize).offset((page - 1) * pageSize);
  return <div>
    <p className="mb-5 text-xs text-slate-500 leading-5">Importações e exportações gratuitas nesta fase inicial.</p>
    <DataImporter />
    <section className="panel mt-6">
      <div className="flex items-center gap-2"><Download className="size-5 text-brand" /><h2 className="text-lg font-extrabold">Exportar dados atuais</h2></div>
      <div className="mt-4 flex flex-wrap gap-2">
        <a className="secondary-button" href="/api/data-exports?type=clients&format=csv">Clientes CSV</a><a className="secondary-button" href="/api/data-exports?type=clients&format=xlsx">Clientes XLSX</a>
        <a className="secondary-button" href="/api/data-exports?type=services&format=csv">Serviços CSV</a><a className="secondary-button" href="/api/data-exports?type=services&format=xlsx">Serviços XLSX</a>
      </div>
    </section>
    <section className="panel mt-6">
      <div className="flex items-center gap-2"><Upload className="size-5 text-brand" /><h2 className="text-lg font-extrabold">Histórico de importações</h2></div>
      <div className="mt-4 max-h-[40rem] overflow-y-auto divide-y">{history.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-bold">{item.fileName}</p><p className="text-xs text-slate-600 leading-5 font-medium">{item.entityType === "clients" ? "Clientes" : "Serviços"} · {item.createdRows} criados · {item.updatedRows} atualizados · {item.errorRows} erros · {item.createdAt.toLocaleString("pt-BR")}</p></div>{item.status === "completed" && !item.undoneAt && <form action={undoDataImport}><input type="hidden" name="id" value={item.id} /><button className="secondary-button flex items-center gap-2"><RotateCcw className="size-4" /> Desfazer</button></form>}{item.undoneAt && <span className="status-pill">Desfeita</span>}</div>)}{!history.length && <p className="empty-state">Nenhuma importação realizada.</p>}</div>
      <ListPagination path="/configuracoes" query={{ aba: "imports" }} page={page} pageSize={pageSize} total={total} label="Importações" />
    </section>
  </div>;
}
