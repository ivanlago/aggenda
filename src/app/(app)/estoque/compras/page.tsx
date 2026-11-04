import { and, asc, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { saveInventorySupplier } from "@/actions/inventory-purchases";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { PaginatedCollection } from "@/components/paginated-collection";
import { db } from "@/db";
import { inventoryProducts, inventoryPurchaseItems, inventoryPurchases, inventorySuppliers } from "@/db/schema";
import { organizationDate } from "@/lib/appointment-safety";
import { hasOrganizationPermission } from "@/lib/permissions";
import { requireOrganization } from "@/lib/session";
import { PurchaseForm } from "./purchase-form";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const quantity = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

function SupplierForm({ supplier }: { supplier?: typeof inventorySuppliers.$inferSelect }) {
  return <ActionForm action={saveInventorySupplier} successMessage="Fornecedor salvo." resetOnSuccess={!supplier} className="grid gap-3 md:grid-cols-2">
    {supplier && <input type="hidden" name="id" value={supplier.id} />}
    <label className="grid gap-1 text-sm font-bold">Nome<input className="field" name="name" defaultValue={supplier?.name} required minLength={2} maxLength={160} /></label>
    <label className="grid gap-1 text-sm font-bold">CPF ou CNPJ<input className="field" name="document" defaultValue={supplier?.document ?? ""} maxLength={30} /></label>
    <label className="grid gap-1 text-sm font-bold">E-mail<input className="field" name="email" type="email" defaultValue={supplier?.email ?? ""} maxLength={160} /></label>
    <label className="grid gap-1 text-sm font-bold">Telefone<input className="field" name="phone" type="tel" defaultValue={supplier?.phone ?? ""} maxLength={40} /></label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={supplier?.isActive ?? true} /> Disponível para novas compras</label>
    <div><button className="primary-button">{supplier ? "Salvar fornecedor" : "Cadastrar fornecedor"}</button></div>
  </ActionForm>;
}

export default async function InventoryPurchasesPage() {
  const { organization } = await requireOrganization();
  if (!hasOrganizationPermission(organization.role, "inventory.manage")) return <div className="page-wrap"><p className="panel">Acesso restrito à gestão de estoque.</p></div>;

  const [suppliers, products, purchases] = await Promise.all([
    db.select().from(inventorySuppliers).where(eq(inventorySuppliers.organizationId, organization.id)).orderBy(asc(inventorySuppliers.name)),
    db.select({ id: inventoryProducts.id, name: inventoryProducts.name, lotTracking: inventoryProducts.lotTracking, unit: inventoryProducts.unit })
      .from(inventoryProducts).where(and(eq(inventoryProducts.organizationId, organization.id), eq(inventoryProducts.isActive, true))).orderBy(asc(inventoryProducts.name)),
    db.select().from(inventoryPurchases).where(eq(inventoryPurchases.organizationId, organization.id)).orderBy(desc(inventoryPurchases.purchasedOn), desc(inventoryPurchases.createdAt)).limit(100),
  ]);
  const activeSuppliers = suppliers.filter(supplier => supplier.isActive);
  const items = purchases.length ? await db.select().from(inventoryPurchaseItems)
    .where(inArray(inventoryPurchaseItems.purchaseId, purchases.map(purchase => purchase.id))) : [];
  const itemsByPurchase = Map.groupBy(items, item => item.purchaseId);

  return <div className="page-wrap grid gap-4">
    <PageHeader eyebrow="Estoque" title="Compras e fornecedores" description="Cadastre fornecedores e registre mercadorias recebidas no estoque de venda ou consumo." />
    <nav className="flex flex-wrap gap-2" aria-label="Compras e estoque">
      <a className="secondary-button" href="#fornecedores">Fornecedores</a>
      <Link className="secondary-button" href="/estoque/lotes">Consultar lotes</Link>
      <Link className="secondary-button" href="/estoque">Voltar ao estoque</Link>
    </nav>
    <section className="panel grid gap-3">
      <h2 className="font-extrabold">Nova compra</h2>
      <p className="text-sm text-muted">Registre a compra quando receber os produtos. Para itens controlados por lote, informe o número e a validade. Se o lote já existir com esses dados, o saldo será somado ao lote existente.</p>
      {activeSuppliers.length && products.length
        ? <PurchaseForm suppliers={activeSuppliers.map(({ id, name }) => ({ id, name }))} products={products} today={organizationDate(new Date(), organization.timezone)} />
        : <p className="text-sm">Cadastre pelo menos um fornecedor ativo e um produto no estoque para registrar a compra.</p>}
    </section>
    <section className="panel grid gap-3">
      <h2 className="font-extrabold">Compras registradas</h2>
      <p className="text-sm text-muted">Até 100 compras recentes.</p>
      <PaginatedCollection label="Compras registradas" className="grid gap-3">
        {purchases.map(purchase => <details key={purchase.id} className="rounded-xl border p-3">
          <summary className="cursor-pointer font-bold">{purchase.purchasedOn.split("-").reverse().join("/")} · {purchase.supplierName} · {money.format(purchase.totalInCents / 100)}</summary>
          {purchase.reference && <p className="mt-2 text-sm">Referência: {purchase.reference}</p>}
          <ul className="mt-2 grid gap-2">
            {itemsByPurchase.get(purchase.id)?.map(item => <li key={item.id} className="text-sm">
              {item.productName} · {quantity.format(item.quantityMillis / 1000)} · {item.pool === "sale" ? "Venda" : "Consumo"} · {money.format(item.totalInCents / 100)}
              {item.lotId && <> · <Link className="font-bold text-brand underline" href={"/estoque/lotes/" + item.lotId}>Ver lote</Link></>}
            </li>)}
          </ul>
        </details>)}
      </PaginatedCollection>
      {!purchases.length && <p className="text-sm text-muted">Nenhuma compra registrada.</p>}
    </section>
    <section id="fornecedores" className="panel grid gap-3">
      <h2 className="font-extrabold">Fornecedores</h2>
      <details open={!suppliers.length} className="rounded-xl border p-3">
        <summary className="cursor-pointer font-bold">Novo fornecedor</summary>
        <div className="mt-3"><SupplierForm /></div>
      </details>
      <PaginatedCollection label="Fornecedores cadastrados" className="grid gap-3">
        {suppliers.map(supplier => <details key={supplier.id} className="rounded-xl border p-3">
          <summary className="cursor-pointer font-bold">{supplier.name} · {supplier.isActive ? "Ativo" : "Inativo"}</summary>
          <div className="mt-3"><SupplierForm supplier={supplier} /></div>
        </details>)}
      </PaginatedCollection>
    </section>
  </div>;
}
