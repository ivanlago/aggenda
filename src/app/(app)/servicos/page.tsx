import { ServiceRepeatPolicy } from "@/components/service-repeat-policy";
import { eq } from "drizzle-orm";
import { Calculator, Trash2 } from "lucide-react";
import Link from "next/link";

import { createService, deleteService, updateService } from "@/actions/app";
import { ServiceCreateToggle } from "@/components/service-create-toggle";
import { ServiceDepositFields } from "@/components/service-deposit-fields";
import { ServiceReturnFields } from "@/components/service-return-fields";
import { ModalShell } from "@/components/modal-shell";
import { PageHeader } from "@/components/page-header";
import { TussAutocomplete } from "@/components/tuss-autocomplete";
import { db } from "@/db";
import { saveServiceCategory, deleteServiceCategory } from "@/actions/service-categories";
import { services, serviceCategories } from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { hasOrganizationPermission } from "@/lib/permissions";
import { EntityImageField, EntityThumbnail } from "@/components/entity-image-field";

export const metadata = { title: "Serviços" };

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { organization } = await requireOrganization();
  const canManage = hasOrganizationPermission(organization.role, "services.manage");
  const { category: selectedCategory = "" } = await searchParams;
  const categories = await db.select().from(serviceCategories).where(eq(serviceCategories.organizationId, organization.id)).orderBy(serviceCategories.name);
  const allItems = await db.select().from(services)
    .where(eq(services.organizationId, organization.id))
    .orderBy(services.name);

  const items = allItems.filter(item => !selectedCategory || (selectedCategory === "none" ? !item.categoryId : item.categoryId === selectedCategory));
  const categoryNames = new Map(categories.map(category => [category.id, category.name]));

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Catálogo"
        title={organization.serviceLabelPlural}
        description={`Defina duração e preço dos ${organization.serviceLabelPlural.toLowerCase()} oferecidos.`}
      />
      <div className="mb-5"><Link className="secondary-button" href="/calculadora-retorno" target="_blank" rel="noopener noreferrer"><Calculator className="mr-2 size-4" />Calculadora de retorno</Link></div>
      {canManage && <details className="panel mb-5"><summary className="cursor-pointer font-extrabold">Categorias de {organization.serviceLabelPlural.toLowerCase()}</summary>
        <form action={saveServiceCategory} className="mt-4 flex flex-wrap items-end gap-3"><label className="grid gap-2 text-sm font-bold">Nova categoria<input name="name" className="field" required minLength={2} maxLength={80} placeholder="Ex.: Consultas" /></label><button className="primary-button">Criar categoria</button></form>
        <p className="mt-3 text-sm text-muted">Ao excluir uma categoria, seus serviços ficam sem categoria.</p>
        <div className="mt-3 divide-y">{categories.map(category => <div key={category.id} className="flex flex-wrap items-center gap-3 py-3"><form action={saveServiceCategory} className="flex flex-wrap items-center gap-2"><input type="hidden" name="id" value={category.id} /><input aria-label="Nome da categoria" className="field" name="name" defaultValue={category.name} required minLength={2} maxLength={80} /><button className="secondary-button">Salvar categoria</button></form><form action={deleteServiceCategory}><input type="hidden" name="id" value={category.id} /><button className="icon-button" aria-label={`Excluir categoria ${category.name}`}><Trash2 className="size-4" /></button></form></div>)}</div>
      </details>}
      <form className="mb-5 flex flex-wrap items-end gap-3"><label className="grid gap-2 text-sm font-bold">Filtrar por categoria<select name="category" className="field" defaultValue={selectedCategory}><option value="">Todas as categorias</option><option value="none">Sem categoria</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><button className="secondary-button">Filtrar</button></form>
      <div className="grid gap-6">
        {canManage && <ServiceCreateToggle label={organization.serviceLabel}>
          <form action={createService} className="grid min-w-0 gap-5 sm:grid-cols-2">
            <div className="min-w-0 sm:col-span-2"><TussAutocomplete table="22" label="Guia TUSS 22 (opcional)" onSelectNameField="name" onSelectCodeField="manualTussCode" /></div>
            <label className="grid min-w-0 content-start gap-2 text-sm font-bold sm:col-span-2">Nome completo do procedimento<input className="field" name="name" required /></label>
            <div className="grid min-w-0 gap-5 sm:col-span-2 lg:grid-cols-3">
              <label className="grid min-w-0 content-start gap-2 text-sm font-bold">Código TUSS (opcional)<input className="field" name="manualTussCode" /></label>
            <label className="grid min-w-0 content-start gap-2 text-sm font-bold">Nome reduzido<input className="field" name="shortName" maxLength={80} placeholder="Ex.: RM, USG" /></label>
              <label className="grid min-w-0 content-start gap-2 text-sm font-bold">Duração em minutos<input className="field" name="durationMinutes" type="number" min="5" step="5" required /></label>
            </div>
            <label className="grid min-w-0 content-start gap-2 text-sm font-bold sm:col-span-2">Descrição<textarea className="field min-h-24" name="description" /></label>
            <label className="grid min-w-0 content-start gap-2 text-sm font-bold sm:col-span-2">Preparação necessária<textarea className="field min-h-24" name="preparation" /></label>
            <div className="grid min-w-0 gap-5 sm:col-span-2 lg:grid-cols-4 lg:[&>label]:grid-rows-[2.5rem_auto]">
              
              <label className="grid min-w-0 content-start gap-2 text-sm font-bold"><span className="self-end">Preço em reais</span><input className="field" name="price" inputMode="decimal" placeholder="Ex.: 150,00" /></label>
              <label className="grid min-w-0 content-start gap-2 text-sm font-bold"><span className="self-end">Custo estimado em reais</span><input className="field" name="estimatedCost" inputMode="decimal" placeholder="Produtos, taxas etc." /></label>
            <ServiceDepositFields /></div>
            <div className="grid min-w-0 items-start gap-5 sm:col-span-2 lg:grid-cols-[2fr_1fr]"><ServiceReturnFields /><div className="min-w-0"><EntityImageField label={`Imagem do ${organization.serviceLabel.toLowerCase()}`} /></div></div>
<label className="grid min-w-0 gap-2 text-sm font-bold sm:col-span-2">Categoria<select className="field" name="categoryId" defaultValue={""}><option value="">Sem categoria</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <ServiceRepeatPolicy /><div className="border-t pt-4 sm:col-span-2"><button className="primary-button">Adicionar {organization.serviceLabel.toLowerCase()}</button></div>
          </form>
        </ServiceCreateToggle>}
        <section className="panel">
          <h2 className="text-lg font-extrabold">
            {items.length}{" "}
            {(items.length === 1
              ? organization.serviceLabel
              : organization.serviceLabelPlural
            ).toLowerCase()}
          </h2>
          <div className="mt-5 divide-y">
            {items.map((item) => (
              <div key={item.id} id={`procedimento-${item.id}`} className="flex scroll-mt-32 items-center gap-4 py-4 target:rounded-lg target:bg-brand/5">
                <EntityThumbnail src={item.imageUrl} alt={item.name} fallback={item.name[0]} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{item.shortName || item.name}</p><p className="text-sm text-muted">{categoryNames.get(item.categoryId ?? "") ?? "Sem categoria"}</p>
                  <p className="text-sm text-muted">
                    {item.durationMinutes} min
                    {item.priceInCents != null ? ` · ${(item.priceInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}
                  </p>
                </div>
                {canManage && <ModalShell title={`Editar ${organization.serviceLabel.toLowerCase()}: ${item.name}`} variant="edit" wide>
                  <form action={updateService} className="grid min-w-0 gap-5 sm:grid-cols-2">
                    <input type="hidden" name="id" value={item.id} />
                    <div className="min-w-0 sm:col-span-2"><TussAutocomplete table="22" label="Guia TUSS 22" defaultCode={item.tussCode ?? ""} defaultName={item.tussName ?? ""} onSelectNameField="name" onSelectCodeField="manualTussCode" /></div>
                    <label className="grid min-w-0 content-start gap-2 text-sm font-bold sm:col-span-2">Nome completo do procedimento<input className="field" name="name" defaultValue={item.name} required /></label>
            <div className="grid min-w-0 gap-5 sm:col-span-2 lg:grid-cols-3">
                      <label className="grid min-w-0 content-start gap-2 text-sm font-bold">Código TUSS (opcional)<input className="field" name="manualTussCode" defaultValue={item.tussCode ?? ""} /></label>
                    <label className="grid min-w-0 content-start gap-2 text-sm font-bold">Nome reduzido<input className="field" name="shortName" maxLength={80} defaultValue={item.shortName ?? ""} /></label>
              <label className="grid min-w-0 content-start gap-2 text-sm font-bold">Duração em minutos<input className="field" name="durationMinutes" type="number" min="5" step="5" defaultValue={item.durationMinutes} required /></label>
            </div>
                    <label className="grid min-w-0 content-start gap-2 text-sm font-bold sm:col-span-2">Descrição<textarea className="field min-h-24" name="description" defaultValue={item.description ?? ""} /></label>
                    <label className="grid min-w-0 content-start gap-2 text-sm font-bold sm:col-span-2">Preparação necessária<textarea className="field min-h-24" name="preparation" defaultValue={item.preparation ?? ""} /></label>
                    <div className="grid min-w-0 gap-5 sm:col-span-2 lg:grid-cols-4 lg:[&>label]:grid-rows-[2.5rem_auto]">
                      
                      <label className="grid min-w-0 content-start gap-2 text-sm font-bold"><span className="self-end">Preço em reais</span><input className="field" name="price" inputMode="decimal" defaultValue={item.priceInCents == null ? "" : (item.priceInCents / 100).toFixed(2).replace(".", ",")} /></label>
                      <label className="grid min-w-0 content-start gap-2 text-sm font-bold"><span className="self-end">Custo estimado em reais</span><input className="field" name="estimatedCost" inputMode="decimal" defaultValue={(item.estimatedCostInCents / 100).toFixed(2).replace(".", ",")} /></label>
                    <ServiceDepositFields type={item.depositType} value={item.depositValue} /></div>
                    <div className="grid min-w-0 items-start gap-5 sm:col-span-2 lg:grid-cols-[2fr_1fr]"><ServiceReturnFields settings={item} /><div className="min-w-0"><EntityImageField currentUrl={item.imageUrl} label={`Imagem do ${organization.serviceLabel.toLowerCase()}`} /></div></div>
<label className="grid min-w-0 gap-2 text-sm font-bold sm:col-span-2">Categoria<select className="field" name="categoryId" defaultValue={item.categoryId ?? ""}><option value="">Sem categoria</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                    <ServiceRepeatPolicy value={item.publicRepeatPolicy} /><label className="flex items-center gap-2 text-sm font-bold sm:col-span-2"><input type="checkbox" name="isActive" defaultChecked={item.isActive} /> Ativo</label>
                    <div className="border-t pt-4 sm:col-span-2"><button className="primary-button">Salvar alterações</button></div>
                  </form>
                </ModalShell>}
                {canManage && <form action={deleteService}>
                  <input type="hidden" name="id" value={item.id} />
                  <button className="icon-button" aria-label={`Excluir ${item.name}`}><Trash2 className="size-4" /></button>
                </form>}
              </div>
            ))}
            {!items.length && (
              <p className="empty-state">
                Nenhum {organization.serviceLabel.toLowerCase()} {selectedCategory ? "nesta categoria" : "cadastrado"}.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
