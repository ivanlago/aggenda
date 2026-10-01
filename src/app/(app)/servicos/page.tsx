import { eq } from "drizzle-orm";
import { Trash2 } from "lucide-react";

import { createService, deleteService, updateService } from "@/actions/app";
import { ServiceCreateToggle } from "@/components/service-create-toggle";
import { ServiceReturnFields } from "@/components/service-return-fields";
import { ModalShell } from "@/components/modal-shell";
import { PageHeader } from "@/components/page-header";
import { TussAutocomplete } from "@/components/tuss-autocomplete";
import { db } from "@/db";
import { services } from "@/db/schema";
import { requireOrganization } from "@/lib/session";
import { hasOrganizationPermission } from "@/lib/permissions";
import { EntityImageField, EntityThumbnail } from "@/components/entity-image-field";

export const metadata = { title: "Serviços" };

export default async function ServicesPage() {
  const { organization } = await requireOrganization();
  const canManage = hasOrganizationPermission(organization.role, "services.manage");
  const items = await db.select().from(services)
    .where(eq(services.organizationId, organization.id))
    .orderBy(services.name);

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="Catálogo"
        title={organization.serviceLabelPlural}
        description={`Defina duração e preço dos ${organization.serviceLabelPlural.toLowerCase()} oferecidos.`}
      />
      <div className="grid gap-6">
        {canManage && <ServiceCreateToggle label={organization.serviceLabel}>
          <form action={createService} className="grid min-w-0 gap-5 sm:grid-cols-2">
            <div className="min-w-0 sm:col-span-2"><TussAutocomplete table="22" label="Guia TUSS 22 (opcional)" onSelectNameField="name" onSelectCodeField="manualTussCode" /></div>
            <label className="grid min-w-0 gap-2 text-sm font-bold sm:col-span-2">Nome do {organization.serviceLabel.toLowerCase()}<input className="field" name="name" required /></label>
            <label className="grid min-w-0 gap-2 text-sm font-bold">Código TUSS (opcional)<input className="field" name="manualTussCode" /></label>
            <label className="grid min-w-0 gap-2 text-sm font-bold">Nome curto<input className="field" name="shortName" maxLength={80} placeholder="Ex.: RM, USG" /></label>
            <label className="grid min-w-0 gap-2 text-sm font-bold sm:col-span-2">Preparação necessária<textarea className="field min-h-24" name="preparation" /></label>
            <label className="grid min-w-0 gap-2 text-sm font-bold sm:col-span-2">Descrição<textarea className="field min-h-24" name="description" /></label>
            <div className="grid min-w-0 gap-5 sm:col-span-2 lg:grid-cols-3">
              <label className="grid min-w-0 gap-2 text-sm font-bold">Duração em minutos<input className="field" name="durationMinutes" type="number" min="5" step="5" required /></label>
              <label className="grid min-w-0 gap-2 text-sm font-bold">Preço em reais<input className="field" name="price" inputMode="decimal" placeholder="Ex.: 150,00" /></label>
              <label className="grid min-w-0 gap-2 text-sm font-bold">Custo estimado em reais<input className="field" name="estimatedCost" inputMode="decimal" placeholder="Produtos, taxas etc." /></label>
            </div>
            <div className="min-w-0 sm:col-span-2"><EntityImageField label={`Imagem do ${organization.serviceLabel.toLowerCase()}`} /></div>
            <label className="grid min-w-0 gap-2 text-sm font-bold">Tipo de sinal<select className="field" name="depositType" defaultValue="none"><option value="none">Sem sinal</option><option value="fixed">Sinal em reais</option><option value="percentage">Sinal percentual</option><option value="full">Pagamento integral</option></select></label>
            <label className="grid min-w-0 gap-2 text-sm font-bold">Valor do sinal em centavos ou %<input className="field" name="depositValue" type="number" min="0" /></label>
            <ServiceReturnFields />
            <div className="border-t pt-4 sm:col-span-2"><button className="primary-button">Adicionar {organization.serviceLabel.toLowerCase()}</button></div>
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
              <div key={item.id} className="flex items-center gap-4 py-4">
                <EntityThumbnail src={item.imageUrl} alt={item.name} fallback={item.name[0]} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{item.shortName || item.name}</p>
                  <p className="text-sm text-muted">
                    {item.durationMinutes} min
                    {item.priceInCents != null ? ` · ${(item.priceInCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}
                  </p>
                </div>
                {canManage && <ModalShell title={`Editar ${organization.serviceLabel.toLowerCase()}: ${item.name}`} variant="edit">
                  <form action={updateService} className="grid min-w-0 gap-5 sm:grid-cols-2">
                    <input type="hidden" name="id" value={item.id} />
                    <div className="min-w-0 sm:col-span-2"><TussAutocomplete table="22" label="Guia TUSS 22" defaultCode={item.tussCode ?? ""} defaultName={item.tussName ?? ""} onSelectNameField="name" onSelectCodeField="manualTussCode" /></div>
                    <label className="grid min-w-0 gap-2 text-sm font-bold sm:col-span-2">Nome do {organization.serviceLabel.toLowerCase()}<input className="field" name="name" defaultValue={item.name} required /></label>
                    <label className="grid min-w-0 gap-2 text-sm font-bold">Código TUSS<input className="field" name="manualTussCode" defaultValue={item.tussCode ?? ""} /></label>
                    <label className="grid min-w-0 gap-2 text-sm font-bold">Nome curto<input className="field" name="shortName" maxLength={80} defaultValue={item.shortName ?? ""} /></label>
                    <label className="grid min-w-0 gap-2 text-sm font-bold sm:col-span-2">Preparação necessária<textarea className="field min-h-24" name="preparation" defaultValue={item.preparation ?? ""} /></label>
                    <label className="grid min-w-0 gap-2 text-sm font-bold sm:col-span-2">Descrição<textarea className="field min-h-24" name="description" defaultValue={item.description ?? ""} /></label>
                    <div className="grid min-w-0 gap-5 sm:col-span-2 lg:grid-cols-3">
                      <label className="grid min-w-0 gap-2 text-sm font-bold">Duração em minutos<input className="field" name="durationMinutes" type="number" min="5" step="5" defaultValue={item.durationMinutes} required /></label>
                      <label className="grid min-w-0 gap-2 text-sm font-bold">Preço em reais<input className="field" name="price" inputMode="decimal" defaultValue={item.priceInCents == null ? "" : (item.priceInCents / 100).toFixed(2).replace(".", ",")} /></label>
                      <label className="grid min-w-0 gap-2 text-sm font-bold">Custo estimado em reais<input className="field" name="estimatedCost" inputMode="decimal" defaultValue={(item.estimatedCostInCents / 100).toFixed(2).replace(".", ",")} /></label>
                    </div>
                    <div className="min-w-0 sm:col-span-2"><EntityImageField currentUrl={item.imageUrl} label={`Imagem do ${organization.serviceLabel.toLowerCase()}`} /></div>
                    <label className="grid min-w-0 gap-2 text-sm font-bold">Tipo de sinal<select className="field" name="depositType" defaultValue={item.depositType}><option value="none">Sem sinal</option><option value="fixed">Sinal em reais</option><option value="percentage">Sinal percentual</option><option value="full">Pagamento integral</option></select></label>
                    <label className="grid min-w-0 gap-2 text-sm font-bold">Valor do sinal em centavos ou %<input className="field" name="depositValue" type="number" min="0" defaultValue={item.depositValue} /></label>
                    <ServiceReturnFields settings={item} />
                    <label className="flex items-center gap-2 text-sm font-bold sm:col-span-2"><input type="checkbox" name="isActive" defaultChecked={item.isActive} /> Ativo</label>
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
                Nenhum {organization.serviceLabel.toLowerCase()} cadastrado.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
