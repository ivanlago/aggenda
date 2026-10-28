"use client";

import { useState } from "react";
import { createRetailProduct, updateRetailVariant } from "@/actions/retail";
import { ActionForm } from "@/components/action-form";
import { EntityImageField } from "@/components/entity-image-field";
import { ModalShell } from "@/components/modal-shell";
import { FormActions, FormSection } from "@/components/form-dialog-context";
import { ReferenceManager, ReferenceSelect } from "@/components/reference-records";
import type { ReferenceRecord } from "@/lib/reference-records";
import type { StockProductRow } from "./stock-product-list";

type Props = { categories: ReferenceRecord[]; subcategories: (ReferenceRecord & { categoryId: string })[] };

function ProductFields({ categories, subcategories, product }: Props & { product?: StockProductRow }) {
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [createdCategories, setCreatedCategories] = useState<ReferenceRecord[]>([]);
  const categoryOptions = [...new Map([...createdCategories, ...categories].map((item) => [item.id, item])).values()];
  return <ActionForm action={product ? updateRetailVariant : createRetailProduct} successMessage={product ? "Produto atualizado." : "Produto cadastrado."} resetOnSuccess={false} className="grid gap-5 sm:grid-cols-2">
    <p className="col-span-full text-sm text-muted">Campos com * são obrigatórios.</p>
    {product && <><input type="hidden" name="variantId" value={product.variantId} /><input type="hidden" name="isActive" value="on" /><input type="hidden" name="unit" value={product.unit} /></>}
    <FormSection title="Identificação">
      <label className="grid gap-2 text-sm font-bold sm:col-span-2">Nome do produto *<input className="field" name="name" required defaultValue={product?.name} /></label>
      <label className="grid gap-2 text-sm font-bold">Apresentação<input className="field" name="variantName" placeholder="Ex.: 250 ml, 300 g" defaultValue={product?.rawPresentation} /></label>
      <label className="grid gap-2 text-sm font-bold">Marca<input className="field" name="brand" defaultValue={product?.rawBrand} /></label>
      <label className="grid gap-2 text-sm font-bold">SKU<input className="field" name="sku" defaultValue={product?.sku} /></label>
      <label className="grid gap-2 text-sm font-bold">Código de barras<input className="field" name="barcode" defaultValue={product?.barcode} /></label>
    </FormSection>
    <FormSection title="Classificação">
      <ReferenceSelect kind="product_category" name="categoryId" label="Categoria" records={categoryOptions} onCreated={(record) => setCreatedCategories((items) => [...items, record])} value={categoryId} onChange={setCategoryId} emptyLabel="Sem categoria" />
      <ReferenceSelect key={categoryId} kind="product_subcategory" name="subcategoryId" label="Subcategoria" records={subcategories} parents={categoryOptions} parentId={categoryId} defaultValue={categoryId === product?.categoryId ? product?.subcategoryId ?? "" : ""} disabled={!categoryId} emptyLabel="Sem subcategoria" />
    </FormSection>
    <FormSection title="Preços e estoque">
      <label className="grid gap-2 text-sm font-bold">Custo unitário (R$)<input className="field" name="cost" inputMode="decimal" placeholder="0,00" defaultValue={product?.costValue} /></label>
      <label className="grid gap-2 text-sm font-bold">Preço de venda unitário (R$)<input className="field" name="salePrice" inputMode="decimal" placeholder="0,00" defaultValue={product?.saleValue} /></label>
      {!product && <><label className="grid gap-2 text-sm font-bold">Unidade do saldo<select className="field" name="unit" defaultValue="unit"><option value="unit">Unidade</option><option value="mL">mL</option><option value="mg">mg</option><option value="g">g</option><option value="UI">UI</option></select></label><label className="grid gap-2 text-sm font-bold">Quantidade inicial *<input className="field" name="initialQuantity" inputMode="decimal" required defaultValue="0" /></label></>}
      <label className="grid gap-2 text-sm font-bold">Quantidade mínima *<input className="field" name="minimumQuantity" inputMode="decimal" required defaultValue={product?.minimumValue ?? "0"} /></label>
      {!product && <label className="flex items-center gap-3 text-sm font-bold sm:col-span-2"><input type="checkbox" name="isForConsumption" />Produto destinado ao consumo (por padrão, será cadastrado para venda)</label>}
    </FormSection>
    <FormSection title="Informações adicionais"><label className="grid gap-2 text-sm font-bold sm:col-span-2">Descrição<textarea className="field min-h-20" name="description" defaultValue={product?.description} /></label><EntityImageField currentUrl={product?.imageUrl} label="Imagem do produto" /></FormSection>
    <FormActions editing={Boolean(product)} />
  </ActionForm>;
}

export function StockProductForm(props: Props) {
  return <><ModalShell title="Novo produto" variant="new" wide closeOnSuccess description="Cadastre identificação, classificação, preços e saldo inicial."><ProductFields {...props} /></ModalShell><ReferenceManager groups={[{ kind: "product_category", records: props.categories }, { kind: "product_subcategory", records: props.subcategories, parents: props.categories }]} /></>;
}

export function ProductEditButton(props: Props & { product: StockProductRow }) {
  return <ModalShell title={`Editar produto: ${props.product.name}`} variant="edit" wide closeOnSuccess><ProductFields {...props} /></ModalShell>;
}
