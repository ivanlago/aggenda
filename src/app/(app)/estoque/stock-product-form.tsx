"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { createRetailProduct, updateRetailVariant } from "@/actions/retail";
import { ActionForm } from "@/components/action-form";
import { ItemCommissionField } from "@/components/item-commission-field";
import { CatalogImageField } from "@/components/catalog-image-field";
import { ModalShell } from "@/components/modal-shell";
import { FormActions } from "@/components/form-dialog-context";
import { ReferenceManager, ReferenceSelect } from "@/components/reference-records";
import type { ReferenceRecord } from "@/lib/reference-records";
import type { StockProductRow } from "./stock-product-list";

type Props = { categories: ReferenceRecord[]; subcategories: (ReferenceRecord & { categoryId: string })[] };

function ProductFields({ categories, subcategories, product }: Props & { product?: StockProductRow }) {
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const descriptionId = useId();
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [createdCategories, setCreatedCategories] = useState<ReferenceRecord[]>([]);
  const categoryOptions = [...new Map([...createdCategories, ...categories].map((item) => [item.id, item])).values()];
  return <ActionForm action={product ? updateRetailVariant : createRetailProduct} successMessage={product ? "Produto atualizado." : "Produto cadastrado."} resetOnSuccess={false} className="grid min-w-0 gap-5 sm:grid-cols-2">
    {product && <><input type="hidden" name="variantId" value={product.variantId} /><input type="hidden" name="isActive" value="on" /><input type="hidden" name="unit" value={product.unit} /></>}
    <div className="col-span-full grid min-w-0 items-start gap-5 sm:grid-cols-[176px_minmax(0,1fr)]">
      <CatalogImageField currentUrl={product?.imageUrl} label="Imagem do produto" />
      <div className="grid min-w-0 gap-4">
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold">Código de barras<input className="field" name="barcode" defaultValue={product?.barcode} /></label>
          <label className="grid gap-2 text-sm font-bold">Código (SKU)<input className="field" name="sku" defaultValue={product?.sku} /></label>
        </div>
        <label className="grid gap-2 text-sm font-bold">Nome *<input className="field" name="name" required defaultValue={product?.name} /></label>
      </div>
    </div>
    <div className="col-span-full grid min-w-0 gap-4 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-bold">Apresentação<input className="field" name="variantName" placeholder="Ex.: 250 ml, 300 g" defaultValue={product?.rawPresentation} /></label>
      <label className="grid gap-2 text-sm font-bold">Marca<input className="field" name="brand" defaultValue={product?.rawBrand} /></label>
    </div>
    <div className="col-span-full grid min-w-0 gap-4 sm:grid-cols-2">
      <ReferenceSelect kind="product_category" name="categoryId" label="Categoria" records={categoryOptions} onCreated={(record) => setCreatedCategories((items) => [...items, record])} value={categoryId} onChange={setCategoryId} emptyLabel="Sem categoria" />
      <ReferenceSelect key={categoryId} kind="product_subcategory" name="subcategoryId" label="Subcategoria" records={subcategories} parents={categoryOptions} parentId={categoryId} defaultValue={categoryId === product?.categoryId ? product?.subcategoryId ?? "" : ""} disabled={!categoryId} emptyLabel="Sem subcategoria" />
    </div>
    <div className="col-span-full grid min-w-0 gap-4 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-bold">Custo unitário (R$)<input className="field" name="cost" inputMode="decimal" placeholder="0,00" defaultValue={product?.costValue} /></label>
      <label className="grid gap-2 text-sm font-bold">Preço de venda unitário (R$)<input className="field" name="salePrice" inputMode="decimal" placeholder="0,00" defaultValue={product?.saleValue} /></label>
    </div>
    <ItemCommissionField name="commissionRate" value={product?.commissionRateBasisPoints} />
    <div className={`col-span-full grid min-w-0 gap-4 ${product ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
      {!product && <><label className="grid gap-2 text-sm font-bold">Unidade do saldo<select className="field" name="unit" defaultValue="unit"><option value="unit">Unidade</option><option value="mL">mL</option><option value="mg">mg</option><option value="g">g</option><option value="UI">UI</option></select></label><label className="grid gap-2 text-sm font-bold">Quantidade inicial *<input className="field" name="initialQuantity" inputMode="decimal" required defaultValue="0" /></label></>}
      <label className="grid gap-2 text-sm font-bold">Quantidade mínima *<input className="field" name="minimumQuantity" inputMode="decimal" required defaultValue={product?.minimumValue ?? "0"} /></label>
    </div>
    {!product && <label className="col-span-full flex items-center gap-3 text-sm font-bold"><input type="checkbox" name="isForConsumption" />Produto destinado ao consumo (por padrão, será cadastrado para venda)</label>}
    <button type="button" className="secondary-button col-span-full w-fit" aria-expanded={descriptionOpen} aria-controls={descriptionId} onClick={() => setDescriptionOpen(open => !open)}>
      Descrição<ChevronDown aria-hidden="true" className={`size-4 transition-transform ${descriptionOpen ? "rotate-180" : ""}`} />
    </button>
    <div id={descriptionId} className="col-span-full" hidden={!descriptionOpen}>
      <label className="grid gap-2 text-sm font-bold">Descrição<textarea className="field min-h-24" name="description" defaultValue={product?.description} /></label>
    </div>
    <p className="col-span-full text-sm text-muted">Campos com * são obrigatórios.</p>
    <FormActions editing={Boolean(product)} />
  </ActionForm>;
}

export function StockProductForm(props: Props) {
  return <><ModalShell title="Novo produto" variant="new" wide closeOnSuccess><ProductFields {...props} /></ModalShell><ReferenceManager groups={[{ kind: "product_category", records: props.categories }, { kind: "product_subcategory", records: props.subcategories, parents: props.categories }]} /></>;
}

export function ProductEditButton(props: Props & { product: StockProductRow }) {
  return <ModalShell title={`Editar produto: ${props.product.name}`} variant="edit" wide closeOnSuccess><ProductFields {...props} /></ModalShell>;
}
