import { desc, eq } from "drizzle-orm";

import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Auditoria" };

export default async function AuditPage() {
  const { organization } = await requireOrganization();
  if (!hasOrganizationPermission(organization.role, "audit.read")) {
    return (
      <div className="page-wrap">
        <p className="panel">Acesso restrito aos administradores.</p>
      </div>
    );
  }
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
    .where(eq(auditLogs.organizationId, organization.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(200);
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Segurança"
        title="Trilha de auditoria"
        description="Registro das alterações operacionais importantes da organização."
      />
      <section className="panel">
        <div className="divide-y">
          {entries.map((entry) => (
            <div key={entry.id} className="grid gap-1 py-3 sm:grid-cols-[170px_1fr_1fr]">
              <span className="text-sm font-bold text-brand">
                {entry.createdAt.toLocaleString("pt-BR")}
              </span>
              <span className="text-sm">
                {entry.action} · {entry.entityType}
              </span>
              <span className="text-sm text-muted">
                {entry.user || "Sistema"} {entry.entityId ? `· ${entry.entityId}` : ""}
              </span>
            </div>
          ))}
          {!entries.length && <p className="empty-state">Nenhum evento registrado.</p>}
        </div>
      </section>
    </div>
  );
}
