import { PaginatedCollection } from "@/components/paginated-collection";
import { ActionForm } from "@/components/action-form";
import { eq } from "drizzle-orm";
import { Calculator, Trash2 } from "lucide-react";
import Link from "next/link";

import { deleteService } from "@/actions/app";
import { ReferenceManager } from "@/components/reference-records";
import { ModalShell } from "@/components/modal-shell";

import { db } from "@/db";
import { services, serviceCategories, professionals, servicesToProfessionals } from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { hasOrganizationPermission } from "@/lib/permissions";
import { ServiceForm } from "@/components/service-form";
import { EntityThumbnail } from "@/components/entity-image-field";


export async function ServicesCatalog({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const { organization } = await requireOrganization();
  const canManage = hasOrganizationPermission(organization.role, "services.manage", organization.teamPermissionOverrides);
  const categories = await db.select().from(serviceCategories).where(eq(serviceCategories.organizationId, organization.id)).orderBy(serviceCategories.name);
  const [attendants, professionalLinks] = await Promise.all([
    db.select({id: professionals.id, name: professionals.name, isActive: professionals.isActive, isBookable: professionals.isBookable}).from(professionals).where(eq(professionals.organizationId, organization.id)).orderBy(professionals.name),
    db.select({serviceId: servicesToProfessionals.serviceId, professionalId: servicesToProfessionals.professionalId}).from(servicesToProfessionals).where(eq(servicesToProfessionals.organizationId, organization.id)),
  ]);
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
    <div className="grid gap-5">
      <div className="mb-5 flex flex-wrap items-start gap-3">
        {canManage && <ModalShell title={`Novo ${organization.serviceLabel.toLowerCase()}`} variant="new" wide closeOnSuccess>
          <ServiceForm label={organization.serviceLabel} categories={categories} professionals={attendants} />
        </ModalShell>}
        {canManage && <ReferenceManager groups={[{ kind: "service_category", records: categories }]} />}
        <Link className="secondary-button" href="/calculadora-retorno" target="_blank" rel="noopener noreferrer"><Calculator className="mr-2 size-4" />Calculadora de retorno</Link>
      </div>
      <div className="grid gap-6">
        <section className="panel">
          <form action="/produtos-servicos" method="get" className="mb-5 flex flex-wrap items-end gap-3">
            <input type="hidden" name="tab" value="servicos" />
            <label className="grid min-w-0 flex-1 gap-2 text-sm font-bold">Buscar por nome
              <input className="field" type="search" name="q" defaultValue={query} placeholder="Nome do serviço" />
            </label>
            <label className="grid min-w-0 gap-2 text-sm font-bold">Categoria
              <select className="field" name="category" defaultValue={category}>
                <option value="">Todas as categorias</option>
                <option value="none">Sem categoria</option>
                {categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <button className="primary-button" type="submit">Buscar</button>
            {(query || category) && <Link className="secondary-button" href="/produtos-servicos?tab=servicos">Limpar filtros</Link>}
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
                  {!professionalLinks.some(link => link.serviceId === item.id && attendants.some(person => person.id === link.professionalId && person.isActive && person.isBookable)) && <p className="mt-1 text-xs text-amber-800">Sem atendentes habilitados para agendamento</p>}
                </div>
                {canManage && <ModalShell title={`Editar ${organization.serviceLabel.toLowerCase()}: ${item.name}`} variant="edit" wide closeOnSuccess>
                  <ServiceForm item={item} label={organization.serviceLabel} categories={categories} professionals={attendants} selectedProfessionalIds={professionalLinks.filter(link => link.serviceId === item.id).map(link => link.professionalId)} />
                </ModalShell>}
                {canManage && <ActionForm action={deleteService} successMessage="Serviço excluído com sucesso." className="min-w-0 max-w-sm">
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
