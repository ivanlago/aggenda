import { roleLabels } from "@/lib/presentation-labels";
import { PaginatedCollection } from "@/components/paginated-collection";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { organizationMembers, organizations, platformMembers, users } from "@/db/schema";
import { requirePlatformMember } from "@/lib/session";

export const metadata = { title: "Usuários · Aggenda Admin" };

export default async function UsersAdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePlatformMember();
  const search = ((await searchParams).q ?? "").trim().slice(0, 100);
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
      platformRole: platformMembers.role,
      organizationName: organizations.name,
      organizationRole: organizationMembers.role,
    })
    .from(users)
    .leftJoin(platformMembers, eq(platformMembers.userId, users.id))
    .leftJoin(organizationMembers, eq(organizationMembers.userId, users.id))
    .leftJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .orderBy(desc(users.createdAt));
  const items = rows.filter(item => !search || `${item.name} ${item.email} ${item.organizationName ?? ""}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  return (
    <div>
      <h1 className="text-3xl font-extrabold">Usuários</h1>
      <p className="mt-2 text-muted">Contas da plataforma e vínculos com empresas.</p>
      <form method="get" className="mt-5 flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm font-bold">Buscar usuário ou empresa<input className="field" type="search" name="q" defaultValue={search} /></label><button className="secondary-button">Buscar</button></form>
      <div className="panel mt-6 overflow-x-auto max-h-[40rem] overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b text-muted"><th className="py-3">Usuário</th><th>Empresa</th><th>Papel empresarial</th><th>Papel SaaS</th></tr></thead>
          <PaginatedCollection as="tbody" pageSize={20} label="Registros">{items.map((item, index) => (
            <tr className="border-b last:border-0" key={`${item.id}-${item.organizationName ?? index}`}>
              <td className="py-4"><p className="font-bold">{item.name}</p><p className="text-xs text-muted">{item.email}</p></td>
              <td>{item.organizationName ?? "—"}</td><td>{roleLabels[item.organizationRole ?? ""] ?? "—"}</td><td>{roleLabels[item.platformRole ?? ""] ?? "—"}</td>
            </tr>
          ))}</PaginatedCollection>
        </table>
      </div>
    </div>
  );
}
