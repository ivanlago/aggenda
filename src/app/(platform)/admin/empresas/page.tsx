import { subscriptionStatusLabels } from "@/lib/presentation-labels";
import { commercialProducts } from "@/lib/commercial-catalog";
import { PaginatedCollection } from "@/components/paginated-collection";
import { and, countDistinct, desc, eq } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db";
import {
  clients,
  commercialContracts,
  organizationMembers,
  organizationFinancialIntegrations,
  organizationSubscriptions,
  organizations,
  services,
} from "@/db/schema";
import { requirePlatformMember } from "@/lib/session";

export const metadata = { title: "Empresas · Aggenda Admin" };

export default async function CompaniesAdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePlatformMember();
  const search = ((await searchParams).q ?? "").trim().slice(0, 100);
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      businessType: organizations.businessType,
      createdAt: organizations.createdAt,
      plan: organizationSubscriptions.plan,
      contractProduct: commercialContracts.product,
      contractKind: commercialContracts.kind,
      contractEnd: commercialContracts.endsAt,
      subscriptionStatus: organizationSubscriptions.status,
      members: countDistinct(organizationMembers.userId),
      clients: countDistinct(clients.id),
      services: countDistinct(services.id),
      nfseStatus: organizationFinancialIntegrations.status,
    })
    .from(organizations)
    .leftJoin(commercialContracts, eq(commercialContracts.organizationId, organizations.id))
    .leftJoin(organizationSubscriptions, eq(organizationSubscriptions.organizationId, organizations.id))
    .leftJoin(organizationMembers, eq(organizationMembers.organizationId, organizations.id))
    .leftJoin(clients, eq(clients.organizationId, organizations.id))
    .leftJoin(services, eq(services.organizationId, organizations.id))
    .leftJoin(organizationFinancialIntegrations, and(eq(organizationFinancialIntegrations.organizationId, organizations.id), eq(organizationFinancialIntegrations.provider, "nfse")))
    .groupBy(organizations.id, commercialContracts.product, commercialContracts.kind, commercialContracts.endsAt, organizationSubscriptions.plan, organizationSubscriptions.status, organizationFinancialIntegrations.status)
    .orderBy(desc(organizations.createdAt));

  const items = rows.filter(item => !search || `${item.name} ${item.slug}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  return (
    <div>
      <h1 className="text-3xl font-extrabold">Empresas</h1>
      <p className="mt-2 text-muted">Organizações, plano e volume cadastrado na plataforma.</p>
      <form method="get" className="mt-5 flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm font-bold">Buscar empresa<input className="field" type="search" name="q" defaultValue={search} /></label><button className="secondary-button">Buscar</button></form>
      <div className="panel mt-6 overflow-x-auto max-h-[40rem] overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b text-muted"><th className="py-3">Empresa</th><th>Plano de cobrança</th><th>Membros</th><th>Clientes</th><th>Serviços</th><th>NFS-e</th><th>Status</th></tr></thead>
          <PaginatedCollection as="tbody" pageSize={20} label="Registros">
            {items.map((item) => (
              <tr className="border-b last:border-0" key={item.id}>
                <td className="py-4"><Link className="font-bold text-brand" href={`/admin/empresas/${item.id}`}>{item.name}</Link><p className="text-xs text-muted">{item.slug}</p></td>
                <td>{item.contractProduct ? <>{item.contractKind === "trial" ? "Avaliação" : item.contractKind === "pilot" ? "Piloto anual — " : ""}{item.contractKind !== "trial" && (commercialProducts[item.contractProduct as keyof typeof commercialProducts]?.name ?? "Plano comercial")}<p className="text-xs text-muted">Até {item.contractEnd?.toLocaleDateString("pt-BR")}</p></> : item.plan === "trial" ? "Avaliação" : item.plan ? `Legado: ${commercialProducts[item.plan as keyof typeof commercialProducts]?.name ?? "Plano anterior"}` : "Sem contrato"}</td><td>{item.members}</td><td>{item.clients}</td><td>{item.services}</td><td className={item.nfseStatus === "requested" ? "font-bold text-amber-700" : ""}>{item.nfseStatus === "requested" ? "solicitada" : item.nfseStatus === "configured" || item.nfseStatus === "active" ? "ativa" : "—"}</td><td>{subscriptionStatusLabels[item.subscriptionStatus ?? ""] ?? "Não configurada"}</td>
              </tr>
            ))}
          </PaginatedCollection>
        </table>
      </div>
    </div>
  );
}
