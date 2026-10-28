import Link from "next/link";
import { formatOrganizationDateTime } from "@/lib/organization-time";
import { auditPresentation } from "@/lib/audit-presentation";
import { count } from "drizzle-orm";
import { ListPagination } from "@/components/list-pagination";
import { parseListPage } from "@/lib/list-pagination";
import { and, desc, eq, ilike, or } from "drizzle-orm";

import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Auditoria" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ pagina?: string; q?: string; acao?: string; tipo?: string }> }) {
  const { organization } = await requireOrganization();
  if (!hasOrganizationPermission(organization.role, "audit.read")) {
    return (
      <div className="page-wrap">
        <p className="panel">Acesso restrito aos administradores.</p>
      </div>
    );
  }
  const query = await searchParams;
  const search = (query.q ?? "").trim().slice(0, 100);
  const action = (query.acao ?? "").slice(0, 100);
  const entity = (query.tipo ?? "").slice(0, 100);
  const condition = and(eq(auditLogs.organizationId, organization.id), search ? or(ilike(auditLogs.action, `%${search}%`), ilike(auditLogs.entityType, `%${search}%`), ilike(auditLogs.entityId, `%${search}%`)) : undefined, action ? eq(auditLogs.action, action) : undefined, entity ? eq(auditLogs.entityType, entity) : undefined);
  const options = await db.selectDistinct({ action: auditLogs.action, entity: auditLogs.entityType }).from(auditLogs).where(eq(auditLogs.organizationId, organization.id));
  const [{ total }] = await db.select({ total: count() }).from(auditLogs).where(condition);
  const page = Math.min(parseListPage(query.pagina), Math.max(1, Math.ceil(total / 20)));
  const entries = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      createdAt: auditLogs.createdAt,
      user: users.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .where(condition)
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(20).offset((page - 1) * 20);
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Segurança"
        title="Trilha de auditoria"
        description="Registro das alterações operacionais importantes da organização."
      />
      <form method="get" className="panel mb-5 grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-sm font-bold">Buscar evento ou identificador<input className="field" name="q" defaultValue={search} /></label><label className="grid gap-1 text-sm font-bold">Ação<select className="field" name="acao" defaultValue={action}><option value="">Todas</option>{[...new Set(options.map(item => item.action))].sort().map(value => <option key={value} value={value}>{auditPresentation(value, "", null).label} · {value}</option>)}</select></label><label className="grid gap-1 text-sm font-bold">Tipo de registro<select className="field" name="tipo" defaultValue={entity}><option value="">Todos</option>{[...new Set(options.map(item => item.entity))].sort().map(value => <option key={value} value={value}>{auditPresentation("", value, null).object} · {value}</option>)}</select></label><button className="primary-button w-fit">Filtrar</button><Link className="secondary-button w-fit" href="/auditoria">Limpar</Link></form>
      <section className="panel">
        <div className="divide-y">
          {entries.map((entry) => (
            <div key={entry.id} className="grid gap-1 py-3 sm:grid-cols-[170px_1fr_1fr]">
              <span className="text-sm font-bold text-brand">
                {formatOrganizationDateTime(entry.createdAt, organization.timezone)}
              </span>
              <span className="text-sm">
                {auditPresentation(entry.action, entry.entityType, entry.entityId).label} · {auditPresentation(entry.action, entry.entityType, entry.entityId).object}
              </span>
              <span className="text-sm text-muted">
                {entry.user || "Sistema"}{auditPresentation(entry.action, entry.entityType, entry.entityId).href && <Link className="ml-3 font-bold text-brand underline" href={auditPresentation(entry.action, entry.entityType, entry.entityId).href!}>Abrir registro</Link>}<details className="mt-2"><summary className="cursor-pointer">Informações técnicas</summary><p className="break-all">{entry.action} · {entry.entityType} · {entry.entityId ?? "Sem identificador"}</p></details>
              </span>
            </div>
          ))}
          {!entries.length && <p className="empty-state">Nenhum evento registrado.</p>}
        </div>
        <ListPagination path="/auditoria" query={{ q: search, acao: action, tipo: entity }} page={page} total={total} />
      </section>
    </div>
  );
}
