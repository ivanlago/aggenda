import { and, asc, count, eq, ilike, lte, or } from "drizzle-orm";
import { Boxes, PackagePlus, Pencil, ScanBarcode, Search, Tags, Trash2, X } from "lucide-react";
import Link from "next/link";

import { createRetailProduct, deleteRetailProduct, updateRetailVariant } from "@/actions/retail";
import { ActionForm } from "@/components/action-form";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { inventoryProducts, retailProductVariants, retailProducts } from "@/db/schema";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";

const currency = (value: number | null) => ((value ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const quantity = (value: number) => (value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const units: Record<string, string> = { unit: "un", ml: "ml", g: "g", kg: "kg", l: "l", dose: "dose" };
export const metadata = { title: "Produtos" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { organization } = await requireOrganization();
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 80);
  const searchPattern = `%${query}%`;
  const canManage = hasOrganizationPermission(organization.role, "inventory.manage");
  const catalogCondition = query ? and(
    eq(retailProductVariants.organizationId, organization.id),
    or(
      ilike(retailProducts.name, searchPattern), ilike(retailProducts.brand, searchPattern),
      ilike(inventoryProducts.sku, searchPattern), ilike(retailProductVariants.barcode, searchPattern),
    ),
  ) : eq(retailProductVariants.organizationId, organization.id);
  const [productCount, activeCount, lowCount, variants] = await Promise.all([
    db.select({ value: count() }).from(retailProducts).where(eq(retailProducts.organizationId, organization.id)),
    db.select({ value: count() }).from(retailProductVariants).where(and(eq(retailProductVariants.organizationId, organization.id), eq(retailProductVariants.isActive, true))),
    db.select({ value: count() }).from(retailProductVariants).innerJoin(inventoryProducts, eq(inventoryProducts.id, retailProductVariants.inventoryProductId)).where(and(
      eq(retailProductVariants.organizationId, organization.id), eq(retailProductVariants.isActive, true), lte(inventoryProducts.currentQuantityMillis, inventoryProducts.minimumQuantityMillis),
    )),
    db.select({
      id: retailProductVariants.id, productId: retailProductVariants.productId, productName: retailProducts.name,
      brand: retailProducts.brand, description: retailProducts.description, name: retailProductVariants.name, barcode: retailProductVariants.barcode,
      salePriceInCents: retailProductVariants.salePriceInCents, isActive: retailProductVariants.isActive,
      commissionRateBasisPoints: retailProductVariants.commissionRateBasisPoints,
      isForSale: retailProductVariants.isForSale, isForProcedures: retailProductVariants.isForProcedures,
      sku: inventoryProducts.sku, costInCents: inventoryProducts.costInCents,
      unit: inventoryProducts.unit,
      currentQuantityMillis: inventoryProducts.currentQuantityMillis, minimumQuantityMillis: inventoryProducts.minimumQuantityMillis,
    }).from(retailProductVariants)
      .innerJoin(retailProducts, eq(retailProducts.id, retailProductVariants.productId))
      .innerJoin(inventoryProducts, eq(inventoryProducts.id, retailProductVariants.inventoryProductId))
      .where(catalogCondition)
      .orderBy(asc(retailProducts.name), asc(retailProductVariants.name))
      .limit(100),
  ]);

  return <div className="page-wrap">
    <PageHeader eyebrow="Catálogo" title="Produtos" description="Cadastre uma vez e defina se cada produto será vendido, usado em procedimentos ou terá as duas finalidades." />
    <section className="grid gap-4 sm:grid-cols-3">
      <article className="panel"><PackagePlus className="size-5 text-brand" /><p className="mt-4 text-3xl font-extrabold">{productCount[0]?.value ?? 0}</p><p className="text-sm text-muted">produtos no catálogo</p></article>
      <article className="panel"><Tags className="size-5 text-brand" /><p className="mt-4 text-3xl font-extrabold">{activeCount[0]?.value ?? 0}</p><p className="text-sm text-muted">itens ativos</p></article>
      <article className="panel"><Boxes className="size-5 text-amber-600" /><p className="mt-4 text-3xl font-extrabold">{lowCount[0]?.value ?? 0}</p><p className="text-sm text-muted">produtos para repor</p></article>
    </section>

    {canManage && <section className="mt-5">
      <ActionForm action={createRetailProduct} successMessage="Produto cadastrado." className="panel form-stack">
        <div><h2 className="text-lg font-extrabold">Novo produto</h2><p className="text-sm text-muted">Cadastre identificação, preço e estoque em um único formulário.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className="field" name="name" required placeholder="Produto (ex.: Protetor solar)" />
          <input className="field" name="brand" placeholder="Marca" />
          <input className="field" name="variantName" placeholder="Apresentação opcional (ex.: FPS 60 / 50 ml)" />
          <input className="field" name="sku" placeholder="SKU" />
          <label className="relative"><span className="sr-only">Código de barras</span><ScanBarcode className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input className="field w-full pl-9" name="barcode" autoComplete="off" placeholder="Leia ou digite o código de barras" /></label>
          <select className="field" name="unit"><option value="unit">Unidade</option><option value="ml">Mililitro</option><option value="g">Grama</option><option value="kg">Quilograma</option><option value="l">Litro</option><option value="dose">Dose</option></select>
          <input className="field" name="salePrice" inputMode="decimal" placeholder="Preço de venda (se vendido)" />
          <input className="field" name="cost" inputMode="decimal" placeholder="Custo unitário" />
          <input className="field" name="commissionRate" inputMode="decimal" placeholder="Comissão sobre a venda (%)" />
          <input className="field" name="initialQuantity" inputMode="numeric" required placeholder="Quantidade inicial" />
          <input className="field" name="minimumQuantity" inputMode="numeric" required placeholder="Estoque mínimo" />
          <textarea className="field min-h-20 sm:col-span-2" name="description" placeholder="Descrição do produto" />
          <div className="flex flex-wrap gap-4 rounded-xl border p-3 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="isForSale" defaultChecked /> Disponível para venda</label>
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="isForProcedures" defaultChecked /> Utilizado em procedimentos</label>
          </div>
        </div>
        <button className="primary-button">Cadastrar produto</button>
      </ActionForm>
    </section>}

    <section className="panel mt-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-extrabold">Catálogo</h2><p className="text-sm text-muted">A busca consulta nome, marca, SKU e código de barras.</p></div><form className="flex w-full gap-2 sm:max-w-md" method="get"><label className="relative min-w-0 flex-1"><span className="sr-only">Buscar produtos</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input className="field w-full pl-9" name="q" type="search" defaultValue={query} placeholder="Buscar produto" /></label><button className="secondary-button">Buscar</button>{query && <Link className="icon-button" href="/produtos" aria-label="Limpar busca"><X className="size-4" /></Link>}</form></div><div className="mt-4 divide-y">
      {variants.length === 0 && <p className="py-6 text-center text-sm text-muted">{query ? "Nenhum produto encontrado para esta busca." : "Nenhum produto cadastrado."}</p>}
      {variants.map((item) => <article className="py-3" key={item.id}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-extrabold">{item.productName}{item.name !== "Padrão" ? ` · ${item.name}` : ""}</p>{item.isForSale && <span className="status-pill">Venda</span>}{item.isForProcedures && <span className="status-pill">Procedimentos</span>}{!item.isActive && <span className="status-pill">Inativo</span>}</div><p className="truncate text-xs text-muted">{item.brand || "Sem marca"} · variação {item.name} · código {item.barcode || "não informado"}</p></div>
          <div className="flex flex-wrap items-center gap-3"><div className="text-right"><p className="font-extrabold text-brand">{item.isForSale ? currency(item.salePriceInCents) : "Uso interno"}</p><p className="text-xs text-muted">{quantity(item.currentQuantityMillis)} {units[item.unit] ?? item.unit} em estoque</p></div>
          {canManage && <details className="relative"><summary className="secondary-button cursor-pointer list-none [&::-webkit-details-marker]:hidden"><Pencil className="size-4" /> Editar</summary><ActionForm action={updateRetailVariant} successMessage="Produto atualizado." className="absolute right-0 z-20 mt-2 grid w-[min(42rem,calc(100vw-2rem))] gap-3 rounded-2xl border bg-white p-4 shadow-2xl sm:grid-cols-2">
          <input type="hidden" name="variantId" value={item.id} />
          <label className="grid gap-1 text-xs font-bold">Nome<input className="field" name="name" required defaultValue={item.productName} /></label>
          <label className="grid gap-1 text-xs font-bold">Marca<input className="field" name="brand" defaultValue={item.brand ?? ""} /></label>
          <label className="grid gap-1 text-xs font-bold">Apresentação<input className="field" name="variantName" defaultValue={item.name === "Padrão" ? "" : item.name} /></label>
          <label className="grid gap-1 text-xs font-bold">SKU<input className="field" name="sku" defaultValue={item.sku ?? ""} /></label>
          <label className="grid gap-1 text-xs font-bold">Código de barras<input className="field" name="barcode" defaultValue={item.barcode ?? ""} /></label>
          <label className="grid gap-1 text-xs font-bold">Unidade<select className="field" name="unit" defaultValue={item.unit}><option value="unit">Unidade</option><option value="ml">Mililitro</option><option value="g">Grama</option><option value="kg">Quilograma</option><option value="l">Litro</option><option value="dose">Dose</option></select></label>
          <label className="grid gap-1 text-xs font-bold">Preço de venda<input className="field" name="salePrice" inputMode="decimal" defaultValue={(item.salePriceInCents / 100).toFixed(2).replace(".", ",")} /></label>
          <label className="grid gap-1 text-xs font-bold">Custo<input className="field" name="cost" inputMode="decimal" defaultValue={item.costInCents == null ? "" : (item.costInCents / 100).toFixed(2).replace(".", ",")} /></label>
          <label className="grid gap-1 text-xs font-bold">Comissão (%)<input className="field" name="commissionRate" inputMode="decimal" defaultValue={(item.commissionRateBasisPoints / 100).toFixed(2).replace(".", ",")} /></label>
          <label className="grid gap-1 text-xs font-bold">Estoque mínimo<input className="field" name="minimumQuantity" inputMode="decimal" defaultValue={quantity(item.minimumQuantityMillis)} /></label>
          <label className="grid gap-1 text-xs font-bold sm:col-span-2">Descrição<textarea className="field min-h-20" name="description" defaultValue={item.description ?? ""} /></label>
          <div className="flex flex-wrap gap-4 sm:col-span-2"><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" name="isForSale" defaultChecked={item.isForSale} /> Venda</label><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" name="isForProcedures" defaultChecked={item.isForProcedures} /> Procedimentos</label><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" name="isActive" defaultChecked={item.isActive} /> Ativo</label></div>
          <button className="primary-button sm:col-span-2">Salvar alterações</button>
        </ActionForm></details>}
          {canManage && <ActionForm action={deleteRetailProduct} successMessage="Produto excluído."><input type="hidden" name="variantId" value={item.id} /><ConfirmSubmitButton className="icon-button text-red-700" message={`Excluir ${item.productName}? Esta ação não poderá ser desfeita.`}><Trash2 className="size-4" /><span className="sr-only">Excluir {item.productName}</span></ConfirmSubmitButton></ActionForm>}
          </div>
        </div>
      </article>)}
    </div></section>
  </div>;
}
