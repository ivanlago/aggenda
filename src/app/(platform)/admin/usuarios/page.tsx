import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { organizationMembers, organizations, platformMembers, users } from "@/db/schema";
import { requirePlatformMember } from "@/lib/session";

export const metadata = { title: "Usuários · Aggenda Admin" };

export default async function UsersAdminPage() {
  await requirePlatformMember();
  const items = await db
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
  return (
    <div>
      <h1 className="text-3xl font-extrabold">Usuários</h1>
      <p className="mt-2 text-muted">Contas da plataforma e vínculos com empresas.</p>
      <div className="panel mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b text-muted"><th className="py-3">Usuário</th><th>Empresa</th><th>Papel empresarial</th><th>Papel SaaS</th></tr></thead>
          <tbody>{items.map((item, index) => (
            <tr className="border-b last:border-0" key={`${item.id}-${item.organizationName ?? index}`}>
              <td className="py-4"><p className="font-bold">{item.name}</p><p className="text-xs text-muted">{item.email}</p></td>
              <td>{item.organizationName ?? "—"}</td><td>{item.organizationRole ?? "—"}</td><td>{item.platformRole ?? "—"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
