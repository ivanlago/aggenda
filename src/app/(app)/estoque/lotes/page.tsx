import { and, asc, eq, gt, gte, lt, ne, or } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { inventoryLots, inventoryProducts } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { StockMovementControl } from "../stock-movement-control";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

export const metadata = { title: "Lotes e recolhimentos" };
const qty = (value: number) => (value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export default async function LotsPage({ searchParams }: { searchParams: Promise<{ productId?: string; status?: string; page?: string }> }) {
  const { organization } = await requireOrganization();
  const canManage = hasOrganizationPermission(organization.role, "inventory.manage");
  if (!hasOrganizationPermission(organization.role, "inventory.read") && !hasOrganizationPermission(organization.role, "clinical.read")) throw new Error("Sem permissão para consultar lotes.");
  const params = await searchParams;
  const productId = /^[0-9a-f-]{36}$/i.test(params.productId ?? "") ? params.productId : undefined;
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? "1") || 1));
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: organization.timezone }).format(new Date());
  const [products, lots] = await Promise.all([
    db.select({ id: inventoryProducts.id, name: inventoryProducts.name }).from(inventoryProducts).where(eq(inventoryProducts.organizationId, organization.id)).orderBy(inventoryProducts.name).limit(500),
    db.select({ lot: inventoryLots, name: inventoryProducts.name, unit: inventoryProducts.unit }).from(inventoryLots).innerJoin(inventoryProducts, and(eq(inventoryProducts.id, inventoryLots.productId), eq(inventoryProducts.organizationId, organization.id))).where(and(eq(inventoryLots.organizationId, organization.id), productId ? eq(inventoryLots.productId, productId) : undefined,
      params.status === "expired" ? lt(inventoryLots.expiresOn, today) : params.status === "blocked" ? ne(inventoryLots.status, "active") : params.status === "available" ? and(eq(inventoryLots.status, "active"), gte(inventoryLots.expiresOn, today), or(gt(inventoryLots.saleQuantityMillis, 0), gt(inventoryLots.consumptionQuantityMillis, 0))) : undefined)).orderBy(asc(inventoryLots.expiresOn), asc(inventoryLots.id)).limit(51).offset((page - 1) * 50),
  ]);
  const pageHref = (number: number) => `/estoque/lotes?${new URLSearchParams({ ...(productId ? { productId } : {}), ...(params.status ? { status: params.status } : {}), page: String(number) })}`;
  return <div className="page-wrap"><PageHeader eyebrow="Segurança do estoque" title="Lotes e recolhimentos" description="Confira saldos por lote, validade e bloqueios. O vencimento impede novas vendas e utilizações; o estoque físico permanece registrado até a saída." />
    <Link className="secondary-button mb-5" href="/estoque">Voltar ao estoque</Link>
    <section className="panel"><h2 className="text-lg font-extrabold">Localizar lotes</h2><form method="get" className="mt-4 grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-sm font-bold">Produto<select className="field" name="productId" defaultValue={productId ?? ""}><option value="">Todos os produtos</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label className="grid gap-1 text-sm font-bold">Situação<select className="field" name="status" defaultValue={params.status ?? ""}><option value="">Todas</option><option value="available">Disponíveis</option><option value="expired">Vencidos</option><option value="blocked">Bloqueados / recolhidos</option></select></label><button className="primary-button self-end">Filtrar lotes</button></form></section>
    {canManage && <div className="mt-5"><StockMovementControl productId={productId} initialTab="lots" /><p className="mt-2 text-sm text-muted">Entradas, saídas, identificação e ativação de lotes ficam em Movimentação.</p></div>}
    <section className="mt-5 grid gap-3" aria-label="Lotes cadastrados">{lots.slice(0, 50).map(({ lot, name, unit }) => <article className="panel" key={lot.id}><div className="flex flex-wrap justify-between gap-3"><h2 className="font-extrabold">{name} · lote {lot.code}</h2><span className="status-pill">{lot.status === "recalled" ? "Em recolhimento" : lot.status === "quarantine" ? "Quarentena" : !lot.expiresOn ? "Sem validade — bloqueado" : lot.expiresOn < today ? "Vencido — bloqueado" : "Válido"}</span></div><p className="mt-2 text-sm">Validade: {lot.expiresOn?.split("-").reverse().join("/") ?? "Não comprovada"} · Venda: {qty(lot.saleQuantityMillis)} {unit} · Consumo: {qty(lot.consumptionQuantityMillis)} {unit}</p><Link className="secondary-button mt-3" href={`/estoque/lotes/${lot.id}`}>Rastreabilidade e ações do lote</Link></article>)}{!lots.length && <p className="panel text-sm text-muted">Nenhum lote encontrado com estes filtros.</p>}</section>
    <nav className="mt-5 flex justify-between" aria-label="Páginas de lotes">{page > 1 ? <Link href={pageHref(page - 1)} className="secondary-button">Anterior</Link> : <span />}<span>Página {page}</span>{lots.length > 50 ? <Link href={pageHref(page + 1)} className="secondary-button">Próxima</Link> : <span />}</nav>
  </div>;
}
