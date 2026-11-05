import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ServicesCatalog } from "@/components/servicos-catalog";
import { InventoryCatalog } from "@/components/estoque-catalog";
import { PackagesCatalog } from "@/components/pacotes-catalog";
import { KitsCatalog } from "@/components/kits-catalog";
import { requireOrganization } from "@/lib/session";
import { hasOrganizationPermission } from "@/lib/permissions";

export const metadata = { title: "Produtos e Serviços" };
type Params = { tab?: string; q?: string; category?: string; aba?: string; busca?: string; situacao?: string; status?: string };

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { organization } = await requireOrganization();
  const params = await searchParams;
  const tab = params.tab === "pacotes" || params.tab === "kits" ? params.tab : "cadastro";
  const canReadServices = hasOrganizationPermission(organization.role, "services.read", organization.teamPermissionOverrides);
  const canReadInventory = hasOrganizationPermission(organization.role, "inventory.read", organization.teamPermissionOverrides);
  return <div className="page-wrap">
    <PageHeader eyebrow="Catálogo" title="Produtos e Serviços" description="Cadastre produtos e serviços, organize pacotes e monte kits com os itens do seu catálogo." />
    <nav className="mb-6 flex flex-wrap gap-2" aria-label="Áreas de produtos e serviços">
      {[["cadastro", "Produtos e Serviços"], ["pacotes", "Pacotes"], ["kits", "Kit de Produtos/Serviços"]].map(([key, label]) => <Link key={key} className={tab === key ? "primary-button" : "secondary-button"} aria-current={tab === key ? "page" : undefined} href={key === "cadastro" ? "/produtos-servicos" : `/produtos-servicos?tab=${key}`}>{label}</Link>)}
    </nav>
    {tab === "cadastro" && <div className="grid gap-8">{canReadServices && <ServicesCatalog searchParams={Promise.resolve(params)} />}{canReadInventory && <InventoryCatalog />}</div>}
    {tab === "pacotes" && canReadServices && <PackagesCatalog searchParams={Promise.resolve(params)} />}
    {tab === "kits" && canReadServices && <KitsCatalog query={params.q} status={params.status} />}
    {!canReadServices && (tab !== "cadastro" || !canReadInventory) && <p className="empty-state">Seu perfil não tem permissão para acessar este cadastro.</p>}
  </div>;
}
