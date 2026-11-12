import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { catalogKits, retailProducts, retailProductVariants, services } from "@/db/schema";
import { CatalogKitDialog, type KitChoice } from "@/components/catalog-kit-form";
import { PaginatedCollection } from "@/components/paginated-collection";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export async function KitsCatalog({ query = "", status = "active" }: { query?: string; status?: string }) {
  const { organization } = await requireOrganization();
  const canManage = hasOrganizationPermission(organization.role, "services.manage", organization.teamPermissionOverrides);
  const [kits, serviceRows, productRows] = await Promise.all([
    db.select().from(catalogKits).where(eq(catalogKits.organizationId, organization.id)).orderBy(catalogKits.name),
    db.select({ id: services.id, name: services.name }).from(services).where(and(eq(services.organizationId, organization.id), eq(services.isActive, true))).orderBy(services.name),
    db.select({ id: retailProductVariants.id, name: retailProducts.name, variant: retailProductVariants.name }).from(retailProductVariants).innerJoin(retailProducts, and(eq(retailProducts.id, retailProductVariants.productId), eq(retailProducts.organizationId, organization.id)))
      .where(and(eq(retailProductVariants.organizationId, organization.id), eq(retailProductVariants.isActive, true), eq(retailProducts.isActive, true))).orderBy(retailProducts.name),
  ]);
  const choices: KitChoice[] = [...serviceRows.map(item => ({ ...item, type: "service" as const })), ...productRows.map(item => ({ id: item.id, type: "product" as const, name: item.variant === "Padrão" ? item.name : `${item.name} — ${item.variant}` }))];
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const rows = kits.filter(kit => normalize(`${kit.name} ${kit.description ?? ""}`).includes(normalize(query)) && (status === "all" || kit.isActive === (status !== "inactive")));
  return <section className="grid gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3">{canManage && <CatalogKitDialog choices={choices} />}</div>
    <form className="panel flex flex-wrap items-end gap-3" method="get">
      <input type="hidden" name="tab" value="kits" />
      <label className="grid flex-1 gap-2 text-sm font-bold">Buscar kit<input className="field" type="search" name="q" defaultValue={query} /></label>
      <label className="grid gap-2 text-sm font-bold">Situação<select className="field" name="status" defaultValue={status}><option value="active">Ativos</option><option value="inactive">Inativos</option><option value="all">Todos</option></select></label>
      <button className="primary-button">Buscar</button><Link className="secondary-button" href="/produtos-servicos?tab=kits">Limpar</Link>
    </form>
    <div className="panel"><h3 className="font-extrabold">{rows.length} kit(s)</h3><PaginatedCollection label="Kits" className="catalog-records mt-4 grid gap-3">{rows.map(kit => <article className="catalog-record-row rounded-xl border p-3" key={kit.id}>
      <div className="flex items-start justify-between gap-3"><h3 className="font-extrabold">{kit.name}</h3><span className="status-pill">{kit.isActive ? "Ativo" : "Inativo"}</span></div>
      <p className="mt-2 font-bold text-brand">{(kit.priceInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
      {kit.description && <p className="mt-2 text-sm text-muted">{kit.description}</p>}
      <ul className="my-3 grid gap-1 text-sm">{kit.items.map(item => <li key={`${item.type}:${item.id}`}>{item.quantity}× {item.name} · {item.type === "product" ? "Produto" : "Serviço"}</li>)}</ul>
      {canManage && <CatalogKitDialog choices={choices} kit={kit} />}
    </article>)}{!rows.length && <p className="empty-state">Nenhum kit encontrado. Cadastre um kit ou ajuste os filtros.</p>}</PaginatedCollection></div>
  </section>;
}
