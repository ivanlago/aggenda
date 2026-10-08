import { and, eq, ilike } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { clients, services } from "@/db/schema";
import { hasOrganizationPermission, type OrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

const pages: Array<{ label: string; href: string; permission: OrganizationPermission }> = [
  { label: "Dashboard", href: "/dashboard", permission: "organization.read" },
  { label: "Agenda e agendamentos", href: "/agenda", permission: "appointments.read" },
  { label: "Clientes e prontuários", href: "/clientes", permission: "clients.read" },
  { label: "Procedimentos", href: "/servicos", permission: "services.read" },
  { label: "Venda e orçamento", href: "/vendas", permission: "inventory.read" },
  { label: "CRM e conversas comerciais", href: "/crescimento", permission: "crm.read" },
  { label: "Estoque e produtos", href: "/estoque", permission: "inventory.read" },
  { label: "Documentos clínicos", href: "/documentos/clinicos", permission: "documents.read" },
  { label: "Documentos jurídicos", href: "/documentos/juridicos", permission: "documents.read" },
  { label: "Histórico de documentos", href: "/documentos/historico", permission: "documents.read" },
  { label: "Financeiro", href: "/financeiro", permission: "finance.read" },
  { label: "Equipe e profissionais", href: "/equipe", permission: "team.read" },
  { label: "Configurações", href: "/configuracoes", permission: "organization.settings.manage" },
];
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export async function GET(request: Request) {
  const { organization } = await requireOrganization();
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const results = pages.filter(page => hasOrganizationPermission(organization.role, page.permission) && normalize(page.label).includes(normalize(query))).map(page => ({ label: page.label, href: page.href, category: "Página" }));
  if (query.length >= 2) {
    const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    const [clientMatches, serviceMatches] = await Promise.all([
      hasOrganizationPermission(organization.role, "clients.read")
        ? db.select({ id: clients.id, name: clients.name }).from(clients).where(and(eq(clients.organizationId, organization.id), ilike(clients.name, pattern))).orderBy(clients.name).limit(6)
        : Promise.resolve([]),
      hasOrganizationPermission(organization.role, "services.read")
        ? db.select({ id: services.id, name: services.name }).from(services).where(and(eq(services.organizationId, organization.id), ilike(services.name, pattern))).orderBy(services.name).limit(6)
        : Promise.resolve([]),
    ]);
    results.unshift(
      ...clientMatches.map(client => ({ label: client.name, href: `/clientes/${client.id}`, category: "Cliente / prontuário" })),
      ...serviceMatches.map(service => ({ label: service.name, href: `/servicos#procedimento-${service.id}`, category: "Procedimento" })),
    );
  }
  return NextResponse.json({ results: results.slice(0, 15) }, { headers: { "Cache-Control": "private, no-store" } });
}
