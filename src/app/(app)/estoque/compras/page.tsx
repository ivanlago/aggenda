import { and, asc, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { saveInventorySupplier } from "@/actions/inventory-purchases";
import { ActionForm } from "@/components/action-form";
import { FormActions } from "@/components/form-dialog-context";
import { ModalShell } from "@/components/modal-shell";
import { ListPagination } from "@/components/list-pagination";
import { parseListPage, parseListPageSize } from "@/lib/list-pagination";
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
    <FormActions editing={Boolean(supplier)} />
  </ActionForm>;
}

export default async function InventoryPurchasesPage({ searchParams }: { searchParams: Promise<{ pagina?: string; linhas?: string }> }) {
  const { organization } = await requireOrganization();
  if (!hasOrganizationPermission(organization.role, "inventory.manage")) return <div className="page-wrap"><p className="panel">Acesso restrito à gestão de estoque.</p></div>;

  const query = await searchParams;
  const pageSize = parseListPageSize(query.linhas);
  const purchaseCondition = eq(inventoryPurchases.organizationId, organization.id);
  const total = await db.$count(inventoryPurchases, purchaseCondition);
  const page = Math.min(parseListPage(query.pagina), Math.max(1, Math.ceil(total / pageSize)));
  const [suppliers, products, purchases] = await Promise.all([
    db.select().from(inventorySuppliers).where(eq(inventorySuppliers.organizationId, organization.id)).orderBy(asc(inventorySuppliers.name)),
    db.select({ id: inventoryProducts.id, name: inventoryProducts.name, lotTracking: inventoryProducts.lotTracking, unit: inventoryProducts.unit })
      .from(inventoryProducts).where(and(eq(inventoryProducts.organizationId, organization.id), eq(inventoryProducts.isActive, true))).orderBy(asc(inventoryProducts.name)),
    db.select().from(inventoryPurchases).where(purchaseCondition).orderBy(desc(inventoryPurchases.purchasedOn), desc(inventoryPurchases.createdAt), desc(inventoryPurchases.id)).limit(pageSize).offset((page - 1) * pageSize),
  ]);
  const activeSuppliers = suppliers.filter(supplier => supplier.isActive);
  const items = purchases.length ? await db.select().from(inventoryPurchaseItems)
    .where(inArray(inventoryPurchaseItems.purchaseId, purchases.map(purchase => purchase.id))) : [];
  const itemsByPurchase = Map.groupBy(items, item => item.purchaseId);

  return <div className="page-wrap grid gap-4">
    <PageHeader eyebrow="Estoque" title="Compras e fornecedores" description="Cadastre fornecedores e registre mercadorias recebidas no estoque de venda ou consumo." />
    <nav className="flex flex-wrap gap-2" aria-label="Compras e estoque">
      <a className="secondary-button" href="#fornecedores">Fornecedores</a>
      <a className="secondary-button" href="#compras">Compras</a>
      <Link className="secondary-button" href="/estoque/lotes">Consultar lotes</Link>
    </nav>
    <section id="fornecedores" className="panel grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-extrabold">Fornecedores cadastrados</h2>
        <ModalShell title="Novo fornecedor" variant="new" closeOnSuccess><SupplierForm /></ModalShell>
      </div>
      <PaginatedCollection label="Fornecedores cadastrados" className="divide-y">
        {suppliers.map(supplier => <article key={supplier.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div>
            <p className="font-bold">{supplier.name}</p>
            <p className="text-sm text-muted">{[supplier.document, supplier.email, supplier.phone].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="status-pill">{supplier.isActive ? "Ativo" : "Inativo"}</span>
            <ModalShell title={"Editar fornecedor: " + supplier.name} variant="edit" closeOnSuccess><SupplierForm supplier={supplier} /></ModalShell>
          </div>
        </article>)}
      </PaginatedCollection>
      {!suppliers.length && <p className="text-sm text-muted">Nenhum fornecedor cadastrado.</p>}
    </section>
    <section id="compras" className="panel grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-extrabold">Compras registradas</h2>
      {activeSuppliers.length && products.length
        ? <ModalShell title="Nova compra" variant="new" wide closeOnSuccess description="Registre os produtos recebidos. Para itens controlados por lote, informe o número e a validade.">
            <PurchaseForm suppliers={activeSuppliers.map(({ id, name }) => ({ id, name }))} products={products} today={organizationDate(new Date(), organization.timezone)} />
          </ModalShell>
        : null}
      </div>
      {(!activeSuppliers.length || !products.length) && <p className="text-sm text-muted">Cadastre um fornecedor ativo e um produto no estoque para registrar a compra.</p>}
      <p className="text-sm text-muted">Até 100 compras recentes.</p>
      <div className="grid gap-3 max-h-[40rem] overflow-y-auto">
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
      </div>
      <ListPagination path="/estoque/compras" query={{}} page={page} pageSize={pageSize} total={total} label="Compras registradas" />
      {!purchases.length && <p className="text-sm text-muted">Nenhuma compra registrada.</p>}
    </section>
  </div>;
}
