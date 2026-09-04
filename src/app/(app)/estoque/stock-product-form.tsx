"use client";

import { Plus, Tags, X } from "lucide-react";
import { useMemo, useState } from "react";

import { createInventoryCategory, createInventorySubcategory } from "@/actions/inventory";
import { createRetailProduct } from "@/actions/retail";
import { ActionForm } from "@/components/action-form";

type Category = { id: string; name: string };
type Subcategory = { id: string; categoryId: string; name: string };

export function StockProductForm({ categories, subcategories }: { categories: Category[]; subcategories: Subcategory[] }) {
  const [open, setOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const filteredSubcategories = useMemo(() => subcategories.filter((item) => item.categoryId === categoryId), [categoryId, subcategories]);

  return <>
    <div className="flex flex-wrap gap-2">
      <button className="primary-button" type="button" onClick={() => setOpen(true)}><Plus className="mr-2 inline size-4" />Novo produto</button>
      <button className="secondary-button" type="button" onClick={() => setCategoriesOpen(true)}><Tags className="mr-2 inline size-4" />Categorias</button>
    </div>
    {open && <section className="panel mt-4">
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-extrabold">Novo produto</h2><p className="text-sm text-muted">Cadastre identificação, classificação, preços e saldo inicial.</p></div><button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Fechar"><X className="size-4" /></button></div>
      <ActionForm action={createRetailProduct} successMessage="Produto cadastrado." className="mt-5 grid gap-3 sm:grid-cols-2" onSuccess={() => setOpen(false)}>
        <label className="grid gap-1 text-sm font-bold">Nome do produto<input className="field" name="name" required /></label>
        <label className="grid gap-1 text-sm font-bold">Apresentação<input className="field" name="variantName" placeholder="Ex.: 250 ml, 300 g" /></label>
        <label className="grid gap-1 text-sm font-bold">Marca<input className="field" name="brand" /></label>
        <label className="grid gap-1 text-sm font-bold">Categoria<select className="field" name="categoryId" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Sem categoria</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-bold">Subcategoria<select className="field" name="subcategoryId" disabled={!categoryId} defaultValue=""><option value="">Sem subcategoria</option>{filteredSubcategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-bold">Unidade de controle<select className="field" name="unit" defaultValue="unit"><option value="unit">Unidade</option><option value="ml">Mililitro</option><option value="g">Grama</option><option value="kg">Quilograma</option><option value="l">Litro</option><option value="dose">Dose</option></select></label>
        <label className="grid gap-1 text-sm font-bold">Custo unitário<input className="field" name="cost" inputMode="decimal" placeholder="0,00" /></label>
        <label className="grid gap-1 text-sm font-bold">Preço de venda unitário<input className="field" name="salePrice" inputMode="decimal" placeholder="0,00" /></label>
        <label className="grid gap-1 text-sm font-bold">Quantidade inicial<input className="field" name="initialQuantity" inputMode="decimal" required defaultValue="0" /></label>
        <label className="grid gap-1 text-sm font-bold">Quantidade mínima<input className="field" name="minimumQuantity" inputMode="decimal" required defaultValue="0" /></label>
        <label className="grid gap-1 text-sm font-bold">SKU<input className="field" name="sku" /></label>
        <label className="grid gap-1 text-sm font-bold">Código de barras<input className="field" name="barcode" /></label>
        <label className="grid gap-1 text-sm font-bold sm:col-span-2">Descrição<textarea className="field min-h-20" name="description" /></label>
        <button className="primary-button sm:col-span-2">Cadastrar produto</button>
      </ActionForm>
    </section>}
    {categoriesOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label="Categorias de produtos"><div className="w-full max-w-xl rounded-3xl bg-white p-5 shadow-2xl"><div className="flex justify-between gap-3"><div><p className="eyebrow">Classificação</p><h2 className="text-xl font-extrabold">Categorias e subcategorias</h2></div><button className="icon-button" type="button" onClick={() => setCategoriesOpen(false)}><X className="size-5" /></button></div><div className="mt-5 grid gap-5 sm:grid-cols-2"><ActionForm action={createInventoryCategory} successMessage="Categoria cadastrada." className="grid gap-3"><h3 className="font-extrabold">Nova categoria</h3><input className="field" name="name" required placeholder="Ex.: Cabelo" /><button className="secondary-button">Cadastrar</button></ActionForm><ActionForm action={createInventorySubcategory} successMessage="Subcategoria cadastrada." className="grid gap-3"><h3 className="font-extrabold">Nova subcategoria</h3><select className="field" name="categoryId" required defaultValue=""><option value="" disabled>Categoria</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input className="field" name="name" required placeholder="Ex.: Shampoo" /><button className="secondary-button">Cadastrar</button></ActionForm></div><div className="mt-5 border-t pt-4 text-sm text-muted">{categories.map((category) => <p className="py-1" key={category.id}><strong>{category.name}:</strong> {subcategories.filter((item) => item.categoryId === category.id).map((item) => item.name).join(", ") || "sem subcategorias"}</p>)}</div></div></div>}
  </>;
}
