import { desc, eq } from "drizzle-orm";
import { Download, RotateCcw, Upload } from "lucide-react";

import { undoDataImport } from "@/actions/data-imports";
import { DataImporter } from "@/components/data-importer";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { dataImports } from "@/db/schema";
import { assertOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Importar e exportar dados" };

export default async function DataPage() {
  const { organization } = await requireOrganization();
  assertOrganizationPermission(organization.role, "clients.read");
  const history = await db.select().from(dataImports).where(eq(dataImports.organizationId, organization.id)).orderBy(desc(dataImports.createdAt)).limit(20);
  return <div className="page-wrap">
    <PageHeader eyebrow="Portabilidade" title="Importar e exportar dados" description="Traga sua carteira de outra plataforma ou baixe uma cópia dos dados cadastrados no Aggenda." />
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
      <div className="mt-4 divide-y">{history.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-bold">{item.fileName}</p><p className="text-sm text-muted">{item.entityType === "clients" ? "Clientes" : "Serviços"} · {item.createdRows} criados · {item.updatedRows} atualizados · {item.errorRows} erros · {item.createdAt.toLocaleString("pt-BR")}</p></div>{item.status === "completed" && !item.undoneAt && <form action={undoDataImport}><input type="hidden" name="id" value={item.id} /><button className="secondary-button flex items-center gap-2"><RotateCcw className="size-4" /> Desfazer</button></form>}{item.undoneAt && <span className="status-pill">Desfeita</span>}</div>)}{!history.length && <p className="empty-state">Nenhuma importação realizada.</p>}</div>
    </section>
  </div>;
}
