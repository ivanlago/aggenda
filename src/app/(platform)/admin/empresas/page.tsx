import { and, countDistinct, desc, eq } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db";
import {
  clients,
  organizationMembers,
  organizationFinancialIntegrations,
  organizationSubscriptions,
  organizations,
  services,
} from "@/db/schema";
import { requirePlatformMember } from "@/lib/session";

export const metadata = { title: "Empresas · Aggenda Admin" };

export default async function CompaniesAdminPage() {
  await requirePlatformMember();
  const items = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      businessType: organizations.businessType,
      createdAt: organizations.createdAt,
      plan: organizationSubscriptions.plan,
      subscriptionStatus: organizationSubscriptions.status,
      members: countDistinct(organizationMembers.userId),
      clients: countDistinct(clients.id),
      services: countDistinct(services.id),
      nfseStatus: organizationFinancialIntegrations.status,
    })
    .from(organizations)
    .leftJoin(organizationSubscriptions, eq(organizationSubscriptions.organizationId, organizations.id))
    .leftJoin(organizationMembers, eq(organizationMembers.organizationId, organizations.id))
    .leftJoin(clients, eq(clients.organizationId, organizations.id))
    .leftJoin(services, eq(services.organizationId, organizations.id))
    .leftJoin(organizationFinancialIntegrations, and(eq(organizationFinancialIntegrations.organizationId, organizations.id), eq(organizationFinancialIntegrations.provider, "nfse")))
    .groupBy(organizations.id, organizationSubscriptions.plan, organizationSubscriptions.status, organizationFinancialIntegrations.status)
    .orderBy(desc(organizations.createdAt));

  return (
    <div>
      <h1 className="text-3xl font-extrabold">Empresas</h1>
      <p className="mt-2 text-muted">Organizações, plano e volume cadastrado na plataforma.</p>
      <div className="panel mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b text-muted"><th className="py-3">Empresa</th><th>Plano</th><th>Membros</th><th>Clientes</th><th>Serviços</th><th>NFS-e</th><th>Status</th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-b last:border-0" key={item.id}>
                <td className="py-4"><Link className="font-bold text-brand" href={`/admin/empresas/${item.id}`}>{item.name}</Link><p className="text-xs text-muted">{item.slug}</p></td>
                <td>{item.plan ?? "sem plano"}</td><td>{item.members}</td><td>{item.clients}</td><td>{item.services}</td><td className={item.nfseStatus === "requested" ? "font-bold text-amber-700" : ""}>{item.nfseStatus === "requested" ? "solicitada" : item.nfseStatus === "configured" || item.nfseStatus === "active" ? "ativa" : "—"}</td><td>{item.subscriptionStatus ?? "não configurado"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
