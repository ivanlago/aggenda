import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { PackageCheck, Power, PowerOff } from "lucide-react";
import { toggleServicePackage } from "@/actions/app";
import { ActionForm } from "@/components/action-form";
import { PackageDialog, PreviousPackageDialog } from "@/components/package-form";
import { PageHeader } from "@/components/page-header";
import { PaginatedCollection } from "@/components/paginated-collection";
import { db } from "@/db";
import { clientPackageBalances, clientPackages, clients, servicePackageItems, servicePackages, services } from "@/db/schema";
import { organizationDate } from "@/lib/organization-time";
import { reservedPackageQuantity } from "@/lib/package-remaining";
import { packageSearch, packageSituation, type PackageTemplate } from "@/lib/package-catalog";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Pacotes" };
const money = (value: number) => (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function PackagesPage({ searchParams }: { searchParams: Promise<{ aba?: string; busca?: string; situacao?: string }> }) {
  const { organization } = await requireOrganization();
  const query = await searchParams;
  const canManage = hasOrganizationPermission(organization.role, "services.manage");
  const canImport = hasOrganizationPermission(organization.role, "clients.manage");
  const canSell = hasOrganizationPermission(organization.role, "sales.sell") || hasOrganizationPermission(organization.role, "inventory.manage");
  const now = new Date();
  const today = organizationDate(now, organization.timezone);
  const date = (value: Date) => value.toLocaleDateString("pt-BR", { timeZone: organization.timezone });
  const [procedures, clientRows, templates, templateItems, assigned, balances] = await Promise.all([
    db.select({ id: services.id, name: services.name, isActive: services.isActive }).from(services).where(eq(services.organizationId, organization.id)).orderBy(services.name),
    canImport ? db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.organizationId, organization.id)).orderBy(clients.name) : Promise.resolve([]),
    db.select().from(servicePackages).where(eq(servicePackages.organizationId, organization.id)).orderBy(servicePackages.name),
    db.select({ packageId: servicePackageItems.packageId, serviceId: servicePackageItems.serviceId, serviceName: services.name, quantity: servicePackageItems.quantity }).from(servicePackageItems).innerJoin(services, and(eq(services.id, servicePackageItems.serviceId), eq(services.organizationId, organization.id))).where(eq(servicePackageItems.organizationId, organization.id)),
    db.select({ id: clientPackages.id, clientId: clientPackages.clientId, client: clients.name, packageName: servicePackages.name, priceInCents: clientPackages.priceInCents, status: clientPackages.status, purchasedAt: clientPackages.purchasedAt, expiresAt: clientPackages.expiresAt, notes: clientPackages.notes }).from(clientPackages).innerJoin(clients, and(eq(clients.id, clientPackages.clientId), eq(clients.organizationId, organization.id))).innerJoin(servicePackages, and(eq(servicePackages.id, clientPackages.packageId), eq(servicePackages.organizationId, organization.id))).where(eq(clientPackages.organizationId, organization.id)).orderBy(clientPackages.purchasedAt),
    db.select({ clientPackageId: clientPackageBalances.clientPackageId, serviceId: clientPackageBalances.serviceId, serviceName: services.name, total: clientPackageBalances.totalQuantity, used: clientPackageBalances.usedQuantity, reserved: reservedPackageQuantity }).from(clientPackageBalances).innerJoin(services, and(eq(services.id, clientPackageBalances.serviceId), eq(services.organizationId, organization.id))).where(eq(clientPackageBalances.organizationId, organization.id)),
  ]);
  const models: PackageTemplate[] = templates.map((template) => ({ ...template, items: templateItems.filter((item) => item.packageId === template.id) }));
  const clientsTab = query.aba === "clientes";
  const search = packageSearch(query.busca?.trim() ?? "");
  const modelRows = models.filter((item) => (!search || packageSearch(`${item.name} ${item.description ?? ""}`).includes(search)) && (query.situacao === "all" || (query.situacao === "inactive" ? !item.isActive : item.isActive)));
  const purchases = assigned.map((item) => {
    const entries = balances.filter((balance) => balance.clientPackageId === item.id);
    return { ...item, balances: entries, situation: packageSituation(item.status, item.expiresAt, entries, now) };
  }).filter((item) => (!search || packageSearch(`${item.client} ${item.packageName}`).includes(search)) && (!query.situacao || query.situacao === "all" || item.situation.key === query.situacao));

  return <div className="page-wrap">
    <PageHeader eyebrow="Catálogo e sessões" title="Pacotes" description="Organize os modelos e acompanhe as sessões dos clientes. As novas vendas são realizadas em Venda e orçamento." />
    <div className="mb-5 flex flex-wrap items-start gap-3">
      {canManage && <PackageDialog procedures={procedures} />}
      {canSell && <Link className="secondary-button" href="/vendas?novo=1&tipo=package#venda-form">Vender pacote</Link>}
      {canImport && <PreviousPackageDialog templates={models} clients={clientRows} today={today} />}
    </div>
    <nav className="mb-5 flex flex-wrap gap-2" aria-label="Áreas de pacotes"><Link className={clientsTab ? "secondary-button" : "primary-button"} aria-current={!clientsTab ? "page" : undefined} href="/pacotes">Modelos de pacotes</Link><Link className={clientsTab ? "primary-button" : "secondary-button"} aria-current={clientsTab ? "page" : undefined} href="/pacotes?aba=clientes">Pacotes dos clientes</Link></nav>
    <form className="panel mb-5 flex flex-wrap items-end gap-3" method="get">
      <input type="hidden" name="aba" value={clientsTab ? "clientes" : "modelos"} />
      <label className="grid min-w-0 flex-1 gap-2 text-sm font-bold">{clientsTab ? "Buscar cliente ou pacote" : "Buscar modelo"}<input className="field" type="search" name="busca" defaultValue={query.busca} /></label>
      <label className="grid gap-2 text-sm font-bold">Situação<select key={clientsTab ? "clientes" : "modelos"} className="field" name="situacao" defaultValue={query.situacao ?? (clientsTab ? "all" : "active")}>
        {clientsTab ? <><option value="all">Todas</option><option value="active">Ativo</option><option value="reserved">Sessões reservadas</option><option value="pending_payment">Aguardando pagamento</option><option value="expired">Vencido</option><option value="exhausted">Esgotado</option><option value="cancelled">Cancelado</option><option value="refunded">Estornado</option></> : <><option value="active">Ativos</option><option value="inactive">Inativos</option><option value="all">Todos</option></>}
      </select></label><button className="primary-button">Filtrar</button><Link className="secondary-button" href={clientsTab ? "/pacotes?aba=clientes" : "/pacotes"}>Limpar</Link>
    </form>
    {!clientsTab ? <section className="panel"><h2 className="text-lg font-extrabold">Modelos de pacotes ({modelRows.length})</h2><PaginatedCollection key={JSON.stringify(query)} label="Modelos de pacotes" className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{modelRows.map((template) => <article className="rounded-2xl border p-4" key={template.id}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-extrabold">{template.name}</h3><p className="font-bold text-brand">{money(template.priceInCents)}</p></div><span className="status-pill">{template.isActive ? "Ativo" : "Inativo"}</span></div>
      {template.description && <p className="mt-2 text-sm text-muted">{template.description}</p>}
      <ul className="mt-3 grid gap-1 text-sm">{template.items.map((item) => <li key={item.serviceId}>{item.quantity}× {item.serviceName}</li>)}</ul>
      <p className="mt-3 text-xs text-muted">{template.validityDays ? `Validade: ${template.validityDays} dias a partir da aquisição` : "Sem prazo de validade"}</p>
      <div className="mt-4 flex flex-wrap gap-2">{canSell && template.isActive && <Link className="secondary-button" href={`/vendas?novo=1&pacote=${template.id}#venda-form`}>Vender este pacote</Link>}{canManage && template.isActive && <PackageDialog procedures={procedures} template={template} />}{canManage && <ActionForm action={toggleServicePackage} successMessage={`Modelo ${template.isActive ? "desativado" : "ativado"}.`}><input type="hidden" name="id" value={template.id} /><input type="hidden" name="isActive" value={template.isActive ? "false" : "true"} /><button className="icon-button" aria-label={`${template.isActive ? "Desativar" : "Reativar"} ${template.name}`}>{template.isActive ? <PowerOff className="size-4" /> : <Power className="size-4" />}</button></ActionForm>}</div>
    </article>)}{!modelRows.length && <p className="empty-state">Nenhum modelo encontrado. Cadastre um pacote ou ajuste os filtros.</p>}</PaginatedCollection></section> : <section className="panel"><h2 className="text-lg font-extrabold">Pacotes dos clientes ({purchases.length})</h2><PaginatedCollection key={JSON.stringify(query)} label="Pacotes dos clientes" className="mt-4 divide-y">{purchases.map((item) => <article className="py-4" key={item.id}>
      <div className="flex flex-wrap items-center gap-2"><PackageCheck className="size-4 text-brand" /><h3 className="font-extrabold">{item.client} · {item.packageName}</h3><span className={`status-pill ${item.situation.key === "expired" ? "text-red-700" : ""}`}>{item.situation.label}</span></div>
      <p className="mt-1 text-xs text-muted">Adquirido em {date(item.purchasedAt)} · {money(item.priceInCents)}{item.expiresAt ? ` · válido até ${date(item.expiresAt)}` : " · sem prazo de validade"}</p>
      {item.notes?.startsWith("Pacote anterior —") && <p className="mt-2 text-xs text-muted">{item.notes}</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">{item.balances.map((balance) => <div className="rounded-xl border p-3 text-sm" key={balance.serviceId}><p className="font-bold">{balance.serviceName}</p><p>{item.situation.available ? Math.max(0, balance.total - balance.used) : 0} sessão(ões) disponível(is) agora</p><p className="text-xs text-muted">{Math.max(0, balance.used - balance.reserved)} utilizada(s) · {balance.reserved} reservada(s) · {balance.total} registrada(s)</p>{!item.situation.available && <p className="mt-1 text-xs text-muted">Saldo registrado sem consumo: {Math.max(0, balance.total - balance.used + balance.reserved)}. Indisponível para novas utilizações.</p>}</div>)}</div>
    </article>)}{!purchases.length && <p className="empty-state">Nenhum pacote de cliente encontrado para os filtros.</p>}</PaginatedCollection></section>}
  </div>;
}
