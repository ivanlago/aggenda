import { PaginatedCollection } from "@/components/paginated-collection";
import { ActionForm } from "@/components/action-form";
import { eq } from "drizzle-orm";
import { Calculator, Trash2 } from "lucide-react";
import Link from "next/link";

import { deleteService } from "@/actions/app";
import { ReferenceManager } from "@/components/reference-records";
import { ModalShell } from "@/components/modal-shell";
import { PageHeader } from "@/components/page-header";
import { db } from "@/db";
import { services, serviceCategories } from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { hasOrganizationPermission } from "@/lib/permissions";
import { ServiceForm } from "@/components/service-form";
import { EntityThumbnail } from "@/components/entity-image-field";

export const metadata = { title: "Serviços" };

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const { organization } = await requireOrganization();
  const canManage = hasOrganizationPermission(organization.role, "services.manage");
  const categories = await db.select().from(serviceCategories).where(eq(serviceCategories.organizationId, organization.id)).orderBy(serviceCategories.name);
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const category = typeof params.category === "string" ? params.category : "";
  const normalizeName = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const allItems = await db.select().from(services)
    .where(eq(services.organizationId, organization.id))
    .orderBy(services.name);
  const search = normalizeName(query);
  const items = allItems.filter(item =>
    (!search || normalizeName(item.name).includes(search) || normalizeName(item.shortName ?? "").includes(search)) &&
    (!category || (category === "none" ? item.categoryId === null : item.categoryId === category))
  );

  const categoryNames = new Map(categories.map(category => [category.id, category.name]));

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Catálogo"
        title={organization.serviceLabelPlural}
        description={`Defina duração e preço dos ${organization.serviceLabelPlural.toLowerCase()} oferecidos.`}
      />
      <div className="mb-5"><Link className="secondary-button" href="/calculadora-retorno" target="_blank" rel="noopener noreferrer"><Calculator className="mr-2 size-4" />Calculadora de retorno</Link></div>
      <div className="mb-5 flex flex-wrap items-start gap-3">
        {canManage && <ModalShell title={`Novo ${organization.serviceLabel.toLowerCase()}`} variant="new" wide closeOnSuccess description="Preencha a identificação, a classificação e os dados do procedimento. Campos obrigatórios são indicados com *.">
          <ServiceForm label={organization.serviceLabel} categories={categories} />
        </ModalShell>}
        {canManage && <ReferenceManager groups={[{ kind: "service_category", records: categories }]} />}
      </div>
      <div className="grid gap-6">
        <section className="panel">
          <form action="/servicos" method="get" className="mb-5 flex flex-wrap items-end gap-3">
            <label className="grid min-w-0 flex-1 gap-2 text-sm font-bold">Buscar por nome
              <input className="field" type="search" name="q" defaultValue={query} placeholder="Nome completo ou reduzido" />
            </label>
            <label className="grid min-w-0 gap-2 text-sm font-bold">Categoria
              <select className="field" name="category" defaultValue={category}>
                <option value="">Todas as categorias</option>
                <option value="none">Sem categoria</option>
                {categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <button className="primary-button" type="submit">Buscar</button>
            {(query || category) && <Link className="secondary-button" href="/servicos">Limpar filtros</Link>}
          </form>
          <h2 className="text-lg font-extrabold">
            {items.length}{" "}
            {(items.length === 1
              ? organization.serviceLabel
              : organization.serviceLabelPlural
            ).toLowerCase()}
          </h2>
          <PaginatedCollection label="Registros" className="mt-5 divide-y">
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
                {canManage && <ModalShell title={`Editar ${organization.serviceLabel.toLowerCase()}: ${item.name}`} variant="edit" wide closeOnSuccess>
                  <ServiceForm item={item} label={organization.serviceLabel} categories={categories} />
                </ModalShell>}
                {canManage && <ActionForm action={deleteService} successMessage="Procedimento excluído com sucesso." className="min-w-0 max-w-sm">
                  <input type="hidden" name="id" value={item.id} />
                  <button className="icon-button" aria-label={`Excluir ${item.name}`}><Trash2 className="size-4" /></button>
                </ActionForm>}
              </div>
            ))}
            {!items.length && (
              <p className="empty-state">
                {query || category ? "Nenhum resultado encontrado para os filtros informados." : `Nenhum ${organization.serviceLabel.toLowerCase()} cadastrado.`}
              </p>
            )}
          </PaginatedCollection>
        </section>
      </div>
    </div>
  );
}
